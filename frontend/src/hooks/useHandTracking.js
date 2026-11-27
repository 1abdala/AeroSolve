import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getHandLandmarker,
  detectHandInVideo,
  disposeHandLandmarker,
  INDEX_FINGER_TIP_INDEX,
  THUMB_TIP_INDEX,
  HAND_CONNECTIONS,
} from '../services/handTracking';
import {
  calculatePinchDistance,
  calculateEffectivePinchDistance,
  evaluatePinchGesture,
  mapNormalizedToCanvas,
  renderStrokesToCanvas,
  MIN_POINT_DISTANCE,
  MAX_DROPOUT_GRACE_FRAMES,
  isTrackingInGracePeriod,
  isTrackingGenuinelyLost,
  canResumeSuspendedStroke,
  validateFingertipStability,
  checkHandBoundaryProximity,
} from '../services/airWriting';
import { HandLandmarksSmoother } from '../services/oneEuroFilter';
import {
  processStrokes,
  renderComparisonStrokes,
  DEFAULT_STROKE_CONFIG,
} from '../services/strokeProcessor';

const INITIAL_REJECTION_COUNTERS = {
  totalFrames: 0,
  acceptedFrames: 0,
  rejectedNoHand: 0,
  rejectedLowConfidence: 0,
  rejectedTeleport: 0,
  rejectedPalmScale: 0,
  rejectedResumeGap: 0,
  rejectedResumeTime: 0,
  pinchReleases: 0,
  strokesResumed: 0,
  strokesSplit: 0,
};

export { INDEX_FINGER_TIP_INDEX, THUMB_TIP_INDEX };

/**
 * Custom hook for managing MediaPipe Hand Landmarker lifecycle,
 * real-time video processing, pinch gesture air-writing, and 60 FPS canvas rendering.
 * Incorporates a One Euro Filter to eliminate jitter while preventing lag during fast motion.
 */
export function useHandTracking({ videoRef, cameraActive, showSkeleton = true, showDiagnostics = false }) {
  const showDiagnosticsRef = useRef(showDiagnostics);
  useEffect(() => {
    showDiagnosticsRef.current = showDiagnostics;
  }, [showDiagnostics]);

  // Model state: 'loading' | 'ready' | 'error'
  const [modelState, setModelState] = useState('loading');
  const [modelError, setModelError] = useState(null);

  // Hand tracking & air-writing UI states (throttled)
  const [drawingState, setDrawingState] = useState('no_hand'); // 'no_hand' | 'ready' | 'drawing'
  const [strokeCount, setStrokeCount] = useState(0);

  // Milestone 4: Stroke Processing & Render Mode ('processed' | 'raw' | 'comparison')
  const [renderMode, setRenderModeState] = useState('processed');
  const renderModeRef = useRef('processed');
  const [processedData, setProcessedData] = useState(() => processStrokes([]));
  const processedDataRef = useRef(processedData);

  // Diagnostic Mode: 'pinch' (Pinch Air-Writing) | 'continuous' (Continuous Tracer without pinch)
  const [captureMode, setCaptureModeState] = useState('pinch');
  const captureModeRef = useRef('pinch');

  // Cumulative Frame & Rejection Counters for diagnostic analysis
  const rejectionCountersRef = useRef({ ...INITIAL_REJECTION_COUNTERS });
  const [rejectionCounters, setRejectionCounters] = useState(INITIAL_REJECTION_COUNTERS);

  // Real-time per-frame diagnostic telemetry state
  const diagnosticFrameRef = useRef({
    rawTip: null,
    filteredTip: null,
    rawThumbTip: null,
    filterOffsetNorm: 0,
    filterOffsetPx: 0,
    rawPinchDistance: null,
    smoothedPinchDistance: null,
    effectivePinchDistance: null,
    pixelPinchDistance: null,
    isPinching: false,
    trackingState: 'NONE',
    drawingState: 'no_hand',
    isFrameRejected: false,
    rejectionCategory: 'NONE',
    rejectionReason: 'Initializing',
    frameIntervalMs: 0,
    fingertipVelocity: { speedNormPerSec: 0, speedPxPerSec: 0, vxPxPerSec: 0, vyPxPerSec: 0 },
    boundaryStatus: {
      isNearEdge: false,
      isWristClipped: false,
      minMargin: 1.0,
      clippedLandmarks: [],
      warning: null,
    },
    lastTransition: { type: 'NONE', reason: 'Initial', timestampMs: 0 },
  });

  const [trackingInfo, setTrackingInfo] = useState({
    handedness: null,
    confidence: null,
    indexTip: null,
    rawTip: null,
    filteredTip: null,
    rawThumbTip: null,
    filterOffsetNorm: 0,
    filterOffsetPx: 0,
    pinchDistance: null,
    rawPinchDistance: null,
    smoothedPinchDistance: null,
    effectivePinchDistance: null,
    pixelPinchDistance: null,
    isPinching: false,
    captureMode: 'pinch',
    fps: 0,                   // Display FPS (render rate)
    inferenceFps: 0,          // MediaPipe inference FPS (actual detection rate)
    inferenceDurationMs: 0,   // Per-inference processing latency
    videoTime: 0,
    inferenceTimestamp: 0,
    isInferring: false,
    handDetected: false,
    missedFrames: 0,
    isGraceActive: false,
    fingertipStable: true,
    fingertipReason: '',
    isFrameRejected: false,
    rejectionCategory: 'NONE',
    rejectionReason: '',
    velocity: { speedNormPerSec: 0, speedPxPerSec: 0, vxPxPerSec: 0, vyPxPerSec: 0 },
    boundaryStatus: {
      isNearEdge: false,
      isWristClipped: false,
      minMargin: 1.0,
      clippedLandmarks: [],
      warning: null,
    },
    rejectionCounters: INITIAL_REJECTION_COUNTERS,
    eventLog: [],
  });

  // Canvas references
  const canvasRef = useRef(null);          // Layer 3: Tracking reticle, skeleton, HUD (cleared every frame)
  const drawingCanvasRef = useRef(null);   // Layer 2: Persistent air-writing ink strokes

  // Stroke and pinch state references (high-frequency, avoids React re-renders)
  const strokesRef = useRef([]);           // Completed strokes: Array<Array<{x, y}>>
  const activeStrokeRef = useRef(null);    // Current in-progress stroke: Array<{x, y}> | null
  const strokeSuspendedRef = useRef(null); // Suspended stroke during brief tracking dropouts
  const isPinchingRef = useRef(false);     // Current hysteresis pinch state
  const unpinchedFramesRef = useRef(0);    // Debounce counter for pinch release

  // Temporal smoothing filter for 21 hand landmarks (One Euro Filter)
  // Tuned for natural air-writing & fast strokes: minCutoff = 1.6 Hz (low jitter, responsive at corners), beta = 22.0, dCutoff = 3.0 (fast velocity adaptation)
  const landmarksSmootherRef = useRef(new HandLandmarksSmoother(1.6, 22.0, 3.0));
  const rawDetectionRef = useRef(null);
  const smoothedDetectionRef = useRef(null);
  const lastRawIndexTipRef = useRef(null);

  // Dropout tolerance and grace tracking refs
  const consecutiveMissedFramesRef = useRef(0);
  const lastSuccessfulDetectionTimestampRef = useRef(0);
  const isGraceActiveRef = useRef(false);

  // Diagnostics event log & state tracker
  const eventLogRef = useRef([]);
  const lastTrackingStateRef = useRef('NONE');
  const fingertipStabilityRef = useRef({ isStable: true, reason: 'Initial' });

  // Animation, inference rate, and display FPS refs
  const animFrameIdRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const isTrackingActiveRef = useRef(false);
  const isInferringRef = useRef(false);
  const lastInferenceTimestampRef = useRef(0);
  const lastInferenceTimeRef = useRef(0);
  const inferenceDurationMsRef = useRef(0);

  // Separate Display FPS and MediaPipe Inference FPS counters
  const displayFrameCountRef = useRef(0);
  const lastDisplayFpsUpdateRef = useRef(0);
  const displayFpsRef = useRef(0);

  const inferenceFrameCountRef = useRef(0);
  const lastInferenceFpsUpdateRef = useRef(0);
  const inferenceFpsRef = useRef(0);

  const prevDrawingStateRef = useRef('no_hand');
  const lastReactStateUpdateRef = useRef(0);
  const lastCanvasDimensionsRef = useRef({ width: 0, height: 0 });

  /**
   * Record structured tracking & air-writing events with high-resolution timestamps.
   */
  const logTrackingEvent = useCallback((type, reason, details = {}) => {
    const now = performance.now();
    const date = new Date();
    const timeStr = `${date.toTimeString().split(' ')[0]}.${String(date.getMilliseconds()).padStart(3, '0')}`;

    const event = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timeStr,
      timestampMs: Math.round(now),
      type,
      reason,
      ...details,
    };

    eventLogRef.current = [event, ...eventLogRef.current.slice(0, 24)];
    console.debug(`[AeroSolve] [${type}] ${reason}`, details);
  }, []);

  /**
   * Pre-load or initialize HandLandmarker model.
   */
  const loadModel = useCallback(async () => {
    try {
      setModelError(null);
      await getHandLandmarker();
      setModelState('ready');
      logTrackingEvent('MODEL_READY', 'MediaPipe Hand Landmarker loaded successfully');
    } catch (err) {
      console.error('Failed to load MediaPipe Hand Landmarker:', err);
      setModelState('error');
      setModelError(err.message || 'Failed to load hand tracking model.');
      logTrackingEvent('MODEL_ERROR', err.message || 'Failed to load model');
    }
  }, [logTrackingEvent]);

  /**
   * Process completed raw strokes through the M4 pipeline (sanitize -> smooth -> resample -> normalize).
   * Pure functional execution: does NOT mutate raw stroke data.
   */
  const updateStrokeProcessing = useCallback((configOverrides = {}) => {
    const raw = strokesRef.current;
    const dCanvas = drawingCanvasRef.current;
    let surfaceAspectRatio = 1.0;
    if (dCanvas && dCanvas.width > 0 && dCanvas.height > 0) {
      surfaceAspectRatio = dCanvas.width / dCanvas.height;
    } else if (lastCanvasDimensionsRef.current?.width > 0 && lastCanvasDimensionsRef.current?.height > 0) {
      surfaceAspectRatio = lastCanvasDimensionsRef.current.width / lastCanvasDimensionsRef.current.height;
    }

    const result = processStrokes(raw, {
      ...DEFAULT_STROKE_CONFIG,
      surfaceAspectRatio,
      ...configOverrides,
      normalization: {
        ...DEFAULT_STROKE_CONFIG.normalization,
        surfaceAspectRatio,
        ...(configOverrides.normalization || {}),
      },
    });
    processedDataRef.current = result;
    setProcessedData(result);
    return result;
  }, []);

  /**
   * Clear all drawn air-writing strokes and reset M4 processed data.
   */
  const clearWriting = useCallback(() => {
    strokesRef.current = [];
    activeStrokeRef.current = null;
    strokeSuspendedRef.current = null;
    isPinchingRef.current = false;
    unpinchedFramesRef.current = 0;
    lastRawIndexTipRef.current = null;
    setStrokeCount(0);
    const cleared = processStrokes([]);
    processedDataRef.current = cleared;
    setProcessedData(cleared);
    logTrackingEvent('STROKE_CLEAR', 'Canvas cleared by user');

    const dCanvas = drawingCanvasRef.current;
    if (dCanvas) {
      const ctx = dCanvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, dCanvas.width, dCanvas.height);
      }
    }
  }, [logTrackingEvent]);

  /**
   * Redraw all stored strokes on the drawing canvas (e.g. after stroke completion, mode switch, or resize).
   * Respects renderMode: 'processed' | 'raw' | 'comparison'.
   */
  const refreshDrawingCanvas = useCallback(() => {
    const dCanvas = drawingCanvasRef.current;
    if (!dCanvas) return;

    const ctx = dCanvas.getContext('2d');
    if (!ctx) return;

    const currentMode = renderModeRef.current;
    const rawStrokes = [...strokesRef.current];
    if (activeStrokeRef.current && activeStrokeRef.current.length > 0) {
      rawStrokes.push(activeStrokeRef.current);
    } else if (strokeSuspendedRef.current && strokeSuspendedRef.current.stroke.length > 0) {
      rawStrokes.push(strokeSuspendedRef.current.stroke);
    }

    if (currentMode === 'comparison') {
      const inSitu = processedDataRef.current?.inSituStrokes || [];
      renderComparisonStrokes(
        ctx,
        rawStrokes,
        inSitu,
        dCanvas.width,
        dCanvas.height,
        mapNormalizedToCanvas
      );
    } else if (currentMode === 'processed') {
      const inSitu = [...(processedDataRef.current?.inSituStrokes || [])];
      if (activeStrokeRef.current && activeStrokeRef.current.length > 0) {
        inSitu.push(activeStrokeRef.current);
      } else if (strokeSuspendedRef.current && strokeSuspendedRef.current.stroke.length > 0) {
        inSitu.push(strokeSuspendedRef.current.stroke);
      }

      renderStrokesToCanvas(ctx, inSitu, dCanvas.width, dCanvas.height, {
        strokeStyle: '#38bdf8',
        lineWidth: 4.5,
        shadowColor: 'rgba(56, 189, 248, 0.45)',
        shadowBlur: 8,
      });
    } else {
      // Raw mode
      renderStrokesToCanvas(ctx, rawStrokes, dCanvas.width, dCanvas.height, {
        strokeStyle: '#38bdf8',
        lineWidth: 4.5,
        shadowColor: 'rgba(56, 189, 248, 0.45)',
        shadowBlur: 8,
      });
    }
  }, []);

  /**
   * Update stroke render mode and immediately refresh canvas.
   */
  const setRenderMode = useCallback(
    (newMode) => {
      renderModeRef.current = newMode;
      setRenderModeState(newMode);
      refreshDrawingCanvas();
    },
    [refreshDrawingCanvas]
  );

  /**
   * Diagnostic Mode Switcher: 'pinch' (Pinch-to-Write) vs 'continuous' (Continuous Tracer without pinch)
   */
  const setCaptureMode = useCallback(
    (newMode) => {
      captureModeRef.current = newMode;
      setCaptureModeState(newMode);
      clearWriting();
      logTrackingEvent('MODE_CHANGE', `Switched capture mode to: ${newMode === 'continuous' ? 'Continuous Tracer (No Pinch)' : 'Pinch Air-Writing'}`);
    },
    [clearWriting, logTrackingEvent]
  );

  /**
   * Reset cumulative frame rejection counters and event log for isolated test runs.
   */
  const resetDiagnosticCounters = useCallback(() => {
    rejectionCountersRef.current = {
      totalFrames: 0,
      acceptedFrames: 0,
      rejectedNoHand: 0,
      rejectedLowConfidence: 0,
      rejectedTeleport: 0,
      rejectedPalmScale: 0,
      rejectedResumeGap: 0,
      rejectedResumeTime: 0,
      pinchReleases: 0,
      strokesResumed: 0,
      strokesSplit: 0,
    };
    setRejectionCounters({ ...rejectionCountersRef.current });
    eventLogRef.current = [];
    logTrackingEvent('COUNTERS_RESET', 'Diagnostic frame and rejection counters reset to 0');
  }, [logTrackingEvent]);

  /**
   * Draw the visual tracking overlay (reticle, skeleton, pinch guide, raw vs filtered indicators, HUD) on tracking canvas.
   */
  const renderTrackingOverlay = useCallback(
    (
      ctx,
      canvasWidth,
      canvasHeight,
      detectionResult,
      isPinching,
      pinchDist,
      isGrace = false,
      rawDetectionResult = null,
      diagnosticData = null,
      showDiagHUD = false
    ) => {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // 1. Draw Skeleton Connections if enabled
      if (detectionResult && detectionResult.detected && detectionResult.landmarks) {
        const landmarks = detectionResult.landmarks;
        const indexTip = detectionResult.indexFingertip;
        const thumbTip = detectionResult.thumbTip;

        ctx.save();
        if (isGrace) {
          ctx.globalAlpha = 0.65; // Dim slightly during brief dropout grace period
        }

        if (showSkeleton) {
          ctx.save();
          ctx.lineWidth = 2.5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.strokeStyle = isGrace ? 'rgba(251, 191, 36, 0.35)' : 'rgba(56, 189, 248, 0.35)';

          for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
            const startLm = landmarks[startIdx];
            const endLm = landmarks[endIdx];

            if (startLm && endLm) {
              const startX = (1 - startLm.x) * canvasWidth;
              const startY = startLm.y * canvasHeight;
              const endX = (1 - endLm.x) * canvasWidth;
              const endY = endLm.y * canvasHeight;

              ctx.beginPath();
              ctx.moveTo(startX, startY);
              ctx.lineTo(endX, endY);
              ctx.stroke();
            }
          }
          ctx.restore();

          // Draw Landmark Node Points (0..20, excluding tips 4 and 8 which get highlighted)
          ctx.save();
          for (let i = 0; i < landmarks.length; i++) {
            if (i === INDEX_FINGER_TIP_INDEX || i === THUMB_TIP_INDEX) continue;

            const lm = landmarks[i];
            const x = (1 - lm.x) * canvasWidth;
            const y = lm.y * canvasHeight;

            ctx.beginPath();
            ctx.arc(x, y, 3, 0, 2 * Math.PI);
            ctx.fillStyle = isGrace ? '#fcd34d' : '#60a5fa';
            ctx.fill();
          }
          ctx.restore();
        }

        // 2. Pinch Proximity Guide between Thumb Tip and Index Tip
        if (indexTip && thumbTip) {
          const tipX = (1 - indexTip.x) * canvasWidth;
          const tipY = indexTip.y * canvasHeight;
          const thumbX = (1 - thumbTip.x) * canvasWidth;
          const thumbY = thumbTip.y * canvasHeight;

          ctx.save();
          if (pinchDist < 0.16 || isPinching) {
            ctx.beginPath();
            ctx.moveTo(thumbX, thumbY);
            ctx.lineTo(tipX, tipY);
            ctx.lineWidth = isPinching ? 3 : 1.5;
            ctx.strokeStyle = isPinching
              ? 'rgba(52, 211, 153, 0.9)' // Emerald when pinched
              : 'rgba(251, 191, 36, 0.6)'; // Amber when nearing pinch
            if (!isPinching) {
              ctx.setLineDash([4, 4]);
            }
            ctx.stroke();
          }

          // Thumb Tip Dot
          ctx.beginPath();
          ctx.arc(thumbX, thumbY, isPinching ? 5 : 4, 0, 2 * Math.PI);
          ctx.fillStyle = isPinching ? '#34d399' : '#fbbf24';
          ctx.fill();
          ctx.restore();
        }

        // 3. Highlight Raw Index Tip vs Filtered Index Tip & Lag Vector (when HUD active)
        if (showDiagHUD && rawDetectionResult && rawDetectionResult.indexFingertip) {
          const rawTip = rawDetectionResult.indexFingertip;
          const rX = (1 - rawTip.x) * canvasWidth;
          const rY = rawTip.y * canvasHeight;
          const fX = indexTip ? (1 - indexTip.x) * canvasWidth : rX;
          const fY = indexTip ? indexTip.y * canvasHeight : rY;

          ctx.save();
          // Amber Raw Tip Dot
          ctx.beginPath();
          ctx.arc(rX, rY, 5, 0, 2 * Math.PI);
          ctx.fillStyle = '#f59e0b';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Raw label
          ctx.font = '600 10px "JetBrains Mono", monospace';
          ctx.fillStyle = '#fcd34d';
          ctx.fillText('RAW (8)', rX + 8, rY - 6);

          // Connecting vector line to filtered tip (shows real-time filter lag)
          const lagPx = Math.hypot(rX - fX, rY - fY);
          if (lagPx > 2) {
            ctx.beginPath();
            ctx.setLineDash([3, 3]);
            ctx.moveTo(rX, rY);
            ctx.lineTo(fX, fY);
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.75)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.setLineDash([]);
          }
          ctx.restore();
        }

        // 4. Highlight Index Fingertip (Landmark 8) with Target Reticle & Pinch/Tracer State
        if (indexTip) {
          const tipX = (1 - indexTip.x) * canvasWidth;
          const tipY = indexTip.y * canvasHeight;
          const now = performance.now();
          const isContinuous = captureModeRef.current === 'continuous';

          ctx.save();

          if (isContinuous || isPinching) {
            // --- ACTIVE DRAWING / TRACER STATE RETICLE ---
            const pulse = Math.sin(now / 100) * 4;
            const outerRadius = Math.max(14, 20 + pulse);

            ctx.beginPath();
            ctx.arc(tipX, tipY, outerRadius, 0, 2 * Math.PI);
            ctx.strokeStyle = isGrace ? '#f59e0b' : '#10b981';
            ctx.lineWidth = 2.5;
            ctx.shadowColor = isGrace ? '#f59e0b' : '#10b981';
            ctx.shadowBlur = 16;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(tipX, tipY, 7, 0, 2 * Math.PI);
            ctx.fillStyle = isGrace ? '#fbbf24' : '#34d399';
            ctx.shadowBlur = 0;
            ctx.fill();

            ctx.beginPath();
            ctx.arc(tipX, tipY, 3, 0, 2 * Math.PI);
            ctx.fillStyle = '#ffffff';
            ctx.fill();

            // Tooltip Badge: DRAWING or TRACER
            const labelX = tipX + 16 > canvasWidth - 155 ? tipX - 155 : tipX + 16;
            const labelY = tipY - 16 < 30 ? tipY + 30 : tipY - 16;

            ctx.fillStyle = isGrace ? 'rgba(69, 26, 3, 0.9)' : 'rgba(6, 78, 59, 0.9)';
            ctx.strokeStyle = isGrace ? 'rgba(245, 158, 11, 0.7)' : 'rgba(52, 211, 153, 0.7)';
            ctx.lineWidth = 1;

            ctx.beginPath();
            ctx.roundRect(labelX, labelY - 14, 148, 34, 6);
            ctx.fill();
            ctx.stroke();

            ctx.font = '700 11px Inter, system-ui, sans-serif';
            ctx.fillStyle = isGrace ? '#fde68a' : '#6ee7b7';
            ctx.fillText(
              isGrace ? '● HOLDING (GRACE)' : isContinuous ? '● TRACER ACTIVE' : '● DRAWING ACTIVE',
              labelX + 8,
              labelY
            );

            ctx.font = '500 10px "JetBrains Mono", monospace';
            ctx.fillStyle = isGrace ? '#fef3c7' : '#a7f3d0';
            ctx.fillText(
              isGrace
                ? 'Drawing paused'
                : isContinuous
                ? 'Continuous fingertip trail'
                : `Pinch dist: ${(pinchDist || 0).toFixed(3)}`,
              labelX + 8,
              labelY + 12
            );
          } else {
            // --- READY STATE RETICLE (Cyan Tracking Target) ---
            const pulse = Math.sin(now / 150) * 3;
            const outerRadius = Math.max(12, 18 + pulse);

            ctx.beginPath();
            ctx.arc(tipX, tipY, outerRadius, 0, 2 * Math.PI);
            ctx.strokeStyle = isGrace ? '#fbbf24' : '#38bdf8';
            ctx.lineWidth = 2;
            ctx.shadowColor = isGrace ? '#fbbf24' : '#38bdf8';
            ctx.shadowBlur = 10;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(tipX, tipY, 8, 0, 2 * Math.PI);
            ctx.strokeStyle = isGrace ? '#d97706' : '#2563eb';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(tipX, tipY, 4, 0, 2 * Math.PI);
            ctx.fillStyle = '#ffffff';
            ctx.fill();

            // Tooltip Tag
            const labelX = tipX + 16 > canvasWidth - 150 ? tipX - 150 : tipX + 16;
            const labelY = tipY - 16 < 30 ? tipY + 30 : tipY - 16;

            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(11, 15, 25, 0.85)';
            ctx.strokeStyle = isGrace ? 'rgba(251, 191, 36, 0.5)' : 'rgba(56, 189, 248, 0.4)';
            ctx.lineWidth = 1;

            ctx.beginPath();
            ctx.roundRect(labelX, labelY - 14, 144, 34, 6);
            ctx.fill();
            ctx.stroke();

            ctx.font = '600 11px Inter, system-ui, sans-serif';
            ctx.fillStyle = isGrace ? '#fbbf24' : '#38bdf8';
            ctx.fillText(isGrace ? 'STABILIZING (HOLD)' : 'INDEX TIP (READY)', labelX + 8, labelY);

            ctx.font = '500 10px "JetBrains Mono", monospace';
            ctx.fillStyle = isGrace ? '#fcd34d' : '#94a3b8';
            ctx.fillText(isGrace ? 'Tracking brief dropout' : 'Pinch to write', labelX + 8, labelY + 12);
          }

          ctx.restore();
        }

        ctx.restore();
      }

      // 5. On-Canvas Live Telemetry Ribbon & Boundary Guide (rendered whenever showDiagHUD is true)
      if (showDiagHUD && diagnosticData) {
        ctx.save();
        const diag = diagnosticData;
        const vel = diag.fingertipVelocity || { speedPxPerSec: 0, vxPxPerSec: 0, vyPxPerSec: 0 };
        const isRejected = diag.isFrameRejected;
        const rejCat = diag.rejectionCategory || 'NONE';
        const isContinuous = captureModeRef.current === 'continuous';

        // Draw Safe Tracking Frame Margin Guide (5% border zone where monocular tracking degrades)
        if (diag.boundaryStatus?.isNearEdge) {
          ctx.save();
          const marginX = canvasWidth * 0.05;
          const marginY = canvasHeight * 0.05;
          ctx.strokeStyle = diag.boundaryStatus.isWristClipped
            ? 'rgba(239, 68, 68, 0.55)'
            : 'rgba(245, 158, 11, 0.45)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 6]);
          ctx.strokeRect(marginX, marginY, canvasWidth - 2 * marginX, canvasHeight - 2 * marginY);

          // Boundary Tag in corner
          ctx.font = '600 10px "JetBrains Mono", monospace';
          ctx.fillStyle = diag.boundaryStatus.isWristClipped ? '#fca5a5' : '#fcd34d';
          ctx.fillText(
            diag.boundaryStatus.isWristClipped
              ? '⚠️ BOUNDARY WARNING: WRIST CLIPPED (Model unstable)'
              : '⚠️ BOUNDARY WARNING: <5% EDGE MARGIN',
            marginX + 6,
            marginY + 14
          );
          ctx.restore();
        }

        const barHeight = 32;
        const barY = 8;
        const isDrawingActive = isContinuous || diag.isPinching;
        ctx.fillStyle = 'rgba(6, 9, 17, 0.90)';
        ctx.strokeStyle = isRejected
          ? 'rgba(239, 68, 68, 0.65)'
          : isDrawingActive
          ? 'rgba(16, 185, 129, 0.65)'
          : 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(8, barY, canvasWidth - 16, barHeight, 6);
        ctx.fill();
        ctx.stroke();

        // Mode pill
        ctx.font = '700 11px Inter, system-ui, sans-serif';
        ctx.fillStyle = isContinuous ? '#34d399' : '#38bdf8';
        ctx.fillText(isContinuous ? 'TRACER' : 'PINCH', 18, barY + 20);

        // FPS & latency
        ctx.font = '500 10px "JetBrains Mono", monospace';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`FPS:${displayFpsRef.current}/${inferenceFpsRef.current} (${inferenceDurationMsRef.current}ms)`, 78, barY + 20);

        // Velocity
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(`V:${vel.speedPxPerSec || 0}px/s (X:${vel.vxPxPerSec || 0}, Y:${vel.vyPxPerSec || 0})`, 220, barY + 20);

        // Pinch
        const effP = diag.effectivePinchDistance !== null && diag.effectivePinchDistance !== undefined ? diag.effectivePinchDistance.toFixed(3) : '—';
        const rawP = diag.rawPinchDistance !== null && diag.rawPinchDistance !== undefined ? diag.rawPinchDistance.toFixed(3) : '—';
        ctx.fillText(`Pinch:${effP} (raw:${rawP})`, 410, barY + 20);

        // Lag
        ctx.fillText(`Lag:${diag.filterOffsetPx || 0}px`, 580, barY + 20);

        // Edge boundary indicator
        const bStatus = diag.boundaryStatus;
        if (bStatus?.isWristClipped) {
          ctx.fillStyle = '#f87171';
          ctx.font = '700 10px Inter, system-ui, sans-serif';
          ctx.fillText('WRIST CLIPPED', 655, barY + 20);
        } else if (bStatus?.isNearEdge) {
          ctx.fillStyle = '#fbbf24';
          ctx.font = '700 10px Inter, system-ui, sans-serif';
          ctx.fillText('EDGE <5%', 655, barY + 20);
        } else {
          ctx.fillStyle = '#64748b';
          ctx.font = '500 10px "JetBrains Mono", monospace';
          ctx.fillText('EDGE:OK', 655, barY + 20);
        }

        // Status badge
        if (isRejected) {
          ctx.fillStyle = '#f87171';
          ctx.font = '700 10px Inter, system-ui, sans-serif';
          ctx.fillText(`● REJ: ${rejCat}`, Math.max(760, canvasWidth - 190), barY + 20);
        } else if (isDrawingActive) {
          ctx.fillStyle = '#34d399';
          ctx.font = '700 10px Inter, system-ui, sans-serif';
          ctx.fillText(rejCat === 'STATIONARY_HOLD' ? '● HOLD' : '● DRAWING', Math.max(760, canvasWidth - 95), barY + 20);
        } else {
          ctx.fillStyle = '#38bdf8';
          ctx.font = '700 10px Inter, system-ui, sans-serif';
          ctx.fillText('● READY', Math.max(760, canvasWidth - 75), barY + 20);
        }
        ctx.restore();
      }
    },
    [showSkeleton]
  );

  /**
   * Main tracking & air-writing loop running on requestAnimationFrame.
   */
  const startTrackingLoop = useCallback(() => {
    if (isTrackingActiveRef.current) return;
    isTrackingActiveRef.current = true;
    logTrackingEvent('TRACKING_START', 'Air-writing tracking loop started');

    const processFrame = () => {
      if (!isTrackingActiveRef.current) return;

      const video = videoRef.current;
      const trackingCanvas = canvasRef.current;
      const drawingCanvas = drawingCanvasRef.current;

      if (video && trackingCanvas && drawingCanvas && video.readyState >= 2 && !video.paused && !video.ended) {
        const displayWidth = video.clientWidth;
        const displayHeight = video.clientHeight;

        // Check for viewport resize and sync canvas resolutions
        if (
          trackingCanvas.width !== displayWidth ||
          trackingCanvas.height !== displayHeight ||
          drawingCanvas.width !== displayWidth ||
          drawingCanvas.height !== displayHeight
        ) {
          trackingCanvas.width = displayWidth;
          trackingCanvas.height = displayHeight;
          drawingCanvas.width = displayWidth;
          drawingCanvas.height = displayHeight;

          lastCanvasDimensionsRef.current = { width: displayWidth, height: displayHeight };

          // Redraw existing strokes and update aspect-ratio processing to match new canvas scale
          refreshDrawingCanvas();
          updateStrokeProcessing();
        }

        const now = performance.now();

        // 1. Measure Display FPS (RequestAnimationFrame rate, e.g. 60Hz, 85Hz, 120Hz)
        displayFrameCountRef.current += 1;
        if (now - lastDisplayFpsUpdateRef.current >= 500) {
          displayFpsRef.current = Math.round(
            (displayFrameCountRef.current * 1000) / (now - lastDisplayFpsUpdateRef.current)
          );
          displayFrameCountRef.current = 0;
          lastDisplayFpsUpdateRef.current = now;
        }

        // 2. Pace MediaPipe inference: avoid redundant duplicate execution within high-refresh RAF ticks (< 16ms)
        const isNewVideoTime = video.currentTime !== lastVideoTimeRef.current;
        const timeSinceLastInference = now - lastInferenceTimeRef.current;
        const canRunInference =
          (isNewVideoTime || timeSinceLastInference >= 20) &&
          !isInferringRef.current &&
          timeSinceLastInference >= 15;

        if (canRunInference) {
          lastVideoTimeRef.current = video.currentTime;
          const frameIntervalMs = Math.round(now - (lastInferenceTimestampRef.current || now));
          lastInferenceTimestampRef.current = now;
          isInferringRef.current = true;

          const tStart = performance.now();
          const rawDetection = detectHandInVideo(video, now);
          const tDuration = performance.now() - tStart;

          isInferringRef.current = false;
          lastInferenceTimeRef.current = performance.now();
          inferenceDurationMsRef.current = Math.round(tDuration);
          rawDetectionRef.current = rawDetection;
          rejectionCountersRef.current.totalFrames += 1;

          // Measure MediaPipe actual inference FPS independently from display FPS
          inferenceFrameCountRef.current += 1;
          if (now - lastInferenceFpsUpdateRef.current >= 500) {
            inferenceFpsRef.current = Math.round(
              (inferenceFrameCountRef.current * 1000) / (now - lastInferenceFpsUpdateRef.current)
            );
            inferenceFrameCountRef.current = 0;
            lastInferenceFpsUpdateRef.current = now;
          }

          const dtSec = Math.max(0.001, (now - lastSuccessfulDetectionTimestampRef.current) / 1000);

          // Calculate instantaneous velocity from raw sensor tip
          let speedNormPerSec = 0;
          let speedPxPerSec = 0;
          let vxPxPerSec = 0;
          let vyPxPerSec = 0;

          if (rawDetection?.landmarks?.[INDEX_FINGER_TIP_INDEX] && lastRawIndexTipRef.current) {
            const curRaw = rawDetection.landmarks[INDEX_FINGER_TIP_INDEX];
            const dxNorm = curRaw.x - lastRawIndexTipRef.current.x;
            const dyNorm = curRaw.y - lastRawIndexTipRef.current.y;
            speedNormPerSec = Math.hypot(dxNorm, dyNorm) / dtSec;

            const dxPx = dxNorm * displayWidth;
            const dyPx = dyNorm * displayHeight;
            speedPxPerSec = Math.round(Math.hypot(dxPx, dyPx) / dtSec);
            vxPxPerSec = Math.round(dxPx / dtSec);
            vyPxPerSec = Math.round(dyPx / dtSec);
          }

          let frameRejected = false;
          let rejectionCategory = 'NONE';
          let rejectionReason = 'Accepted';

          const handPresent =
            rawDetection &&
            rawDetection.detected &&
            rawDetection.landmarks &&
            rawDetection.landmarks.length >= 21;

          if (handPresent) {
            if (rawDetection.confidence !== null && rawDetection.confidence < 0.38) {
              rejectionCountersRef.current.rejectedLowConfidence += 1;
            }

            // Check for index fingertip landmark instability vs palm (comparing raw-to-raw sensor coordinates)
            const rawIndexTip = rawDetection.landmarks[INDEX_FINGER_TIP_INDEX];
            const prevTip = lastRawIndexTipRef.current;
            const stabilityCheck = validateFingertipStability(rawDetection.landmarks, prevTip, dtSec);
            fingertipStabilityRef.current = stabilityCheck;

            if (!stabilityCheck.isStable) {
              frameRejected = true;
              if (stabilityCheck.reason.includes('teleported')) {
                rejectionCategory = 'TELEPORT_REJECTED';
                rejectionCountersRef.current.rejectedTeleport += 1;
              } else if (stabilityCheck.reason.includes('anomalous')) {
                rejectionCategory = 'PALM_SCALE_REJECTED';
                rejectionCountersRef.current.rejectedPalmScale += 1;
              } else {
                rejectionCategory = 'LANDMARK_UNSTABLE';
              }
              rejectionReason = stabilityCheck.reason;

              // --- FINGERTIP LANDMARK INSTABILITY (Hand detected, but index tip unstable) ---
              if (lastTrackingStateRef.current !== 'FINGERTIP_UNSTABLE') {
                lastTrackingStateRef.current = 'FINGERTIP_UNSTABLE';
                logTrackingEvent('FINGERTIP_UNSTABLE', stabilityCheck.reason, {
                  confidence: rawDetection.confidence,
                  velocity: speedPxPerSec,
                });
              }

              consecutiveMissedFramesRef.current += 1;

              // Suspend stroke ONLY if instability persists beyond 1 frame (prevents 1-frame spikes from tearing down stroke)
              if (consecutiveMissedFramesRef.current >= 2 && activeStrokeRef.current && !strokeSuspendedRef.current) {
                strokeSuspendedRef.current = {
                  stroke: activeStrokeRef.current,
                  startTime: now,
                  lastPoint: activeStrokeRef.current[activeStrokeRef.current.length - 1],
                };
                activeStrokeRef.current = null;
                logTrackingEvent('STROKE_SUSPENDED', 'Fingertip unstable - holding stroke state');
              }

              // If instability persists beyond grace period, cleanly commit the stroke
              if (consecutiveMissedFramesRef.current > MAX_DROPOUT_GRACE_FRAMES && strokeSuspendedRef.current) {
                if (strokeSuspendedRef.current.stroke.length > 0) {
                  strokesRef.current.push(strokeSuspendedRef.current.stroke);
                  setStrokeCount(strokesRef.current.length);
                  updateStrokeProcessing();
                  refreshDrawingCanvas();
                }
                strokeSuspendedRef.current = null;
                logTrackingEvent('STROKE_SPLIT', 'Instability exceeded grace limit - committed stroke');
              }
            } else {
              // --- STABLE HAND & FINGERTIP DETECTED ---
              lastRawIndexTipRef.current = { x: rawIndexTip.x, y: rawIndexTip.y };

              if (lastTrackingStateRef.current === 'HAND_LOST') {
                const gapMs = Math.round(now - lastSuccessfulDetectionTimestampRef.current);
                logTrackingEvent('HAND_RECOVERED', `Hand re-acquired after ${gapMs}ms`, {
                  gapMs,
                  confidence: rawDetection.confidence,
                });
              } else if (lastTrackingStateRef.current === 'FINGERTIP_UNSTABLE') {
                logTrackingEvent('FINGERTIP_RECOVERED', 'Fingertip landmarks stabilized', {
                  confidence: rawDetection.confidence,
                });
              }

              lastTrackingStateRef.current = 'DETECTED';
              consecutiveMissedFramesRef.current = 0;
              lastSuccessfulDetectionTimestampRef.current = now;
              isGraceActiveRef.current = false;

              // Smooth landmarks with One Euro Filter strictly on valid detections
              const timestampSec = now / 1000;
              const smoothedLandmarks = landmarksSmootherRef.current.smooth(
                rawDetection.landmarks,
                timestampSec
              );
              const smoothedIndexTip = smoothedLandmarks[INDEX_FINGER_TIP_INDEX];
              const smoothedThumbTip = smoothedLandmarks[THUMB_TIP_INDEX];

              smoothedDetectionRef.current = {
                ...rawDetection,
                landmarks: smoothedLandmarks,
                indexFingertip: smoothedIndexTip,
                thumbTip: smoothedThumbTip,
              };

              // Pinch calculation with image-plane 2D distance:
              const smoothedPinchDistance = calculatePinchDistance(smoothedThumbTip, smoothedIndexTip);
              const rawPinchDistance = calculatePinchDistance(rawDetection.thumbTip, rawIndexTip);

              // Responsive pinch gesture evaluation:
              // - Uses raw distance when in direct contact (<= 0.065) to eliminate filter phase lag during fast motion
              // - Uses raw distance when deliberately separated (>= 0.105) to eliminate filter smoothing lag on release
              // - Debounces in tolerance band [0.085, 0.105) for 2 frames without adding trailing ink points
              const pinchEval = evaluatePinchGesture(
                isPinchingRef.current,
                smoothedPinchDistance,
                rawPinchDistance,
                unpinchedFramesRef.current
              );

              const effectiveIsPinching = pinchEval.isPinching;
              const isPinchDebouncing = pinchEval.isDebouncing;
              const shouldAddPoint = pinchEval.shouldAddPoint;
              unpinchedFramesRef.current = pinchEval.unpinchedFrames;

              // Stroke lifecycle and safe resumption management:
              // Map unmirrored camera x to visual writing frame (x = 1 - mediapipeX)
              // so stored strokes match what user sees and writes on mirrored video display.
              const currentPoint = { x: 1 - smoothedIndexTip.x, y: smoothedIndexTip.y };
              const dCtx = drawingCanvas.getContext('2d');

              if (captureModeRef.current === 'continuous') {
                // ==============================================================
                // DIAGNOSTIC CONTINUOUS TRACER MODE (No Pinch Logic)
                // Tracks and renders index fingertip continuously without pinch gating.
                // ==============================================================
                frameRejected = false;
                rejectionCategory = 'NONE';
                rejectionReason = 'Continuous tracer point recorded';
                rejectionCountersRef.current.acceptedFrames += 1;

                if (!activeStrokeRef.current) {
                  activeStrokeRef.current = [currentPoint];
                  logTrackingEvent(
                    'TRACER_START',
                    `Tracer path started at (${currentPoint.x.toFixed(3)}, ${currentPoint.y.toFixed(3)})`
                  );
                  if (dCtx) {
                    const pt = mapNormalizedToCanvas(currentPoint, displayWidth, displayHeight);
                    dCtx.save();
                    dCtx.fillStyle = '#10b981';
                    dCtx.beginPath();
                    dCtx.arc(pt.x, pt.y, 2.5, 0, 2 * Math.PI);
                    dCtx.fill();
                    dCtx.restore();
                  }
                } else {
                  const lastPt = activeStrokeRef.current[activeStrokeRef.current.length - 1];
                  const delta = Math.hypot(currentPoint.x - lastPt.x, currentPoint.y - lastPt.y);

                  if (delta >= MIN_POINT_DISTANCE) {
                    activeStrokeRef.current.push(currentPoint);

                    if (dCtx) {
                      const p1 = mapNormalizedToCanvas(lastPt, displayWidth, displayHeight);
                      const p2 = mapNormalizedToCanvas(currentPoint, displayWidth, displayHeight);
                      dCtx.save();
                      dCtx.strokeStyle = '#10b981'; // Emerald tracer ink
                      dCtx.lineWidth = 4.5;
                      dCtx.lineCap = 'round';
                      dCtx.lineJoin = 'round';
                      dCtx.shadowColor = 'rgba(16, 185, 129, 0.45)';
                      dCtx.shadowBlur = 8;
                      dCtx.beginPath();
                      dCtx.moveTo(p1.x, p1.y);
                      dCtx.lineTo(p2.x, p2.y);
                      dCtx.stroke();
                      dCtx.restore();
                    }
                  }
                }
              } else {
                // ==============================================================
                // STANDARD PINCH AIR-WRITING MODE
                // ==============================================================
                if (effectiveIsPinching) {
                  if (strokeSuspendedRef.current) {
                    // Attempt safe resumption across the brief tracking gap!
                    const elapsedGap = now - strokeSuspendedRef.current.startTime;
                    const resumeCheck = canResumeSuspendedStroke(
                      strokeSuspendedRef.current.lastPoint,
                      currentPoint,
                      elapsedGap
                    );

                    if (resumeCheck.canResume) {
                      // SAFE RESUMPTION: connect last point to current point smoothly
                      rejectionCountersRef.current.strokesResumed += 1;
                      rejectionCountersRef.current.acceptedFrames += 1;
                      frameRejected = false;
                      rejectionCategory = 'NONE';
                      rejectionReason = 'Stroke resumed across tracking gap';

                      activeStrokeRef.current = strokeSuspendedRef.current.stroke;
                      const lastPt = strokeSuspendedRef.current.lastPoint;
                      activeStrokeRef.current.push(currentPoint);
                      strokeSuspendedRef.current = null;

                      logTrackingEvent('STROKE_RESUMED', resumeCheck.reason, {
                        gapMs: Math.round(elapsedGap),
                        distance: Number(resumeCheck.distance.toFixed(3)),
                      });

                      if (dCtx) {
                        const p1 = mapNormalizedToCanvas(lastPt, displayWidth, displayHeight);
                        const p2 = mapNormalizedToCanvas(currentPoint, displayWidth, displayHeight);
                        dCtx.save();
                        dCtx.strokeStyle = '#38bdf8';
                        dCtx.lineWidth = 4.5;
                        dCtx.lineCap = 'round';
                        dCtx.lineJoin = 'round';
                        dCtx.shadowColor = 'rgba(56, 189, 248, 0.45)';
                        dCtx.shadowBlur = 8;
                        dCtx.beginPath();
                        dCtx.moveTo(p1.x, p1.y);
                        dCtx.lineTo(p2.x, p2.y);
                        dCtx.stroke();
                        dCtx.restore();
                      }
                    } else {
                      // GAP EXCEEDED LIMIT: separate stroke to avoid blind connections across space/time
                      rejectionCountersRef.current.strokesSplit += 1;
                      frameRejected = true;
                      if (resumeCheck.reason.includes('Spatial gap distance')) {
                        rejectionCategory = 'RESUME_GAP_REJECTED';
                        rejectionCountersRef.current.rejectedResumeGap += 1;
                      } else {
                        rejectionCategory = 'RESUME_TIME_REJECTED';
                        rejectionCountersRef.current.rejectedResumeTime += 1;
                      }
                      rejectionReason = resumeCheck.reason;

                      if (strokeSuspendedRef.current.stroke.length > 0) {
                        strokesRef.current.push(strokeSuspendedRef.current.stroke);
                        setStrokeCount(strokesRef.current.length);
                        updateStrokeProcessing();
                        refreshDrawingCanvas();
                      }
                      logTrackingEvent('STROKE_SPLIT', resumeCheck.reason, {
                        gapMs: Math.round(elapsedGap),
                        distance: Number(resumeCheck.distance.toFixed(3)),
                      });
                      strokeSuspendedRef.current = null;

                      // Start fresh new stroke at new position
                      activeStrokeRef.current = [currentPoint];
                      if (dCtx) {
                        const pt = mapNormalizedToCanvas(currentPoint, displayWidth, displayHeight);
                        dCtx.save();
                        dCtx.fillStyle = '#38bdf8';
                        dCtx.beginPath();
                        dCtx.arc(pt.x, pt.y, 2.25, 0, 2 * Math.PI);
                        dCtx.fill();
                        dCtx.restore();
                      }
                    }
                  } else if (!isPinchingRef.current) {
                    // Clean new stroke start
                    frameRejected = false;
                    rejectionCategory = 'NONE';
                    rejectionReason = pinchEval.reason;
                    rejectionCountersRef.current.acceptedFrames += 1;

                    activeStrokeRef.current = [currentPoint];
                    logTrackingEvent(
                      'PINCH_START',
                      `Stroke started at (${currentPoint.x.toFixed(3)}, ${currentPoint.y.toFixed(3)})`
                    );
                    if (dCtx) {
                      const pt = mapNormalizedToCanvas(currentPoint, displayWidth, displayHeight);
                      dCtx.save();
                      dCtx.fillStyle = '#38bdf8';
                      dCtx.beginPath();
                      dCtx.arc(pt.x, pt.y, 2.25, 0, 2 * Math.PI);
                      dCtx.fill();
                      dCtx.restore();
                    }
                  } else if (isPinchDebouncing || !shouldAddPoint) {
                    // In release debounce: distance is in tolerance band [0.085, 0.105).
                    // Hold active stroke state to prevent false split on momentary jitter,
                    // but DO NOT push points to avoid drawing unwanted trailing ink if this is a genuine release.
                    frameRejected = false;
                    rejectionCategory = 'PINCH_DEBOUNCING';
                    rejectionReason = pinchEval.reason;
                  } else if (activeStrokeRef.current && activeStrokeRef.current.length > 0) {
                    // Normal continuous stroke point addition
                    const lastPt = activeStrokeRef.current[activeStrokeRef.current.length - 1];
                    const delta = Math.hypot(currentPoint.x - lastPt.x, currentPoint.y - lastPt.y);

                    if (delta >= MIN_POINT_DISTANCE) {
                      frameRejected = false;
                      rejectionCategory = 'NONE';
                      rejectionReason = 'Pinch drawing active: point added';
                      rejectionCountersRef.current.acceptedFrames += 1;

                      activeStrokeRef.current.push(currentPoint);

                      if (dCtx) {
                        const p1 = mapNormalizedToCanvas(lastPt, displayWidth, displayHeight);
                        const p2 = mapNormalizedToCanvas(currentPoint, displayWidth, displayHeight);
                        dCtx.save();
                        dCtx.strokeStyle = '#38bdf8';
                        dCtx.lineWidth = 4.5;
                        dCtx.lineCap = 'round';
                        dCtx.lineJoin = 'round';
                        dCtx.shadowColor = 'rgba(56, 189, 248, 0.45)';
                        dCtx.shadowBlur = 8;
                        dCtx.beginPath();
                        dCtx.moveTo(p1.x, p1.y);
                        dCtx.lineTo(p2.x, p2.y);
                        dCtx.stroke();
                        dCtx.restore();
                      }
                    } else {
                      // Hand is stationary: active pinch is maintained, point suppressed to avoid duplicate stacked points
                      frameRejected = false;
                      rejectionCategory = 'STATIONARY_HOLD';
                      rejectionReason = `Stationary hold: point movement ${delta.toFixed(4)} < minimum distance threshold (${MIN_POINT_DISTANCE})`;
                    }
                  }
                } else {
                  // Pinch intentionally released or ready hovering state
                  frameRejected = false;
                  if (isPinchingRef.current) {
                    rejectionCountersRef.current.pinchReleases += 1;
                    rejectionCategory = 'PINCH_RELEASED';
                    rejectionReason = pinchEval.reason;
                  } else {
                    rejectionCategory = 'READY';
                    rejectionReason = pinchEval.reason;
                  }

                  let committedAny = false;
                  if (strokeSuspendedRef.current) {
                    if (strokeSuspendedRef.current.stroke.length > 0) {
                      strokesRef.current.push(strokeSuspendedRef.current.stroke);
                      setStrokeCount(strokesRef.current.length);
                      committedAny = true;
                    }
                    strokeSuspendedRef.current = null;
                  }
                  if (isPinchingRef.current && activeStrokeRef.current) {
                    logTrackingEvent(
                      'PINCH_END',
                      `Stroke ended (${activeStrokeRef.current.length} points)`
                    );
                    if (activeStrokeRef.current.length > 0) {
                      strokesRef.current.push(activeStrokeRef.current);
                      setStrokeCount(strokesRef.current.length);
                      committedAny = true;
                    }
                    activeStrokeRef.current = null;
                  }
                  if (committedAny) {
                    updateStrokeProcessing();
                    refreshDrawingCanvas();
                  }
                }
              }

              isPinchingRef.current = effectiveIsPinching;
            }
          } else {
            // --- HAND DETECTION LOSS ---
            frameRejected = true;
            rejectionCategory = 'NO_HAND';
            rejectionReason = 'MediaPipe HandLandmarker detected no hand in video';
            rejectionCountersRef.current.rejectedNoHand += 1;

            consecutiveMissedFramesRef.current += 1;
            const elapsed = now - lastSuccessfulDetectionTimestampRef.current;

            if (lastTrackingStateRef.current !== 'HAND_LOST') {
              lastTrackingStateRef.current = 'HAND_LOST';
              logTrackingEvent('HAND_LOST', `Hand not detected in frame (${consecutiveMissedFramesRef.current} missed)`);
            }

            if (captureModeRef.current === 'continuous') {
              // In continuous tracer mode: commit current path when hand genuinely leaves
              if (activeStrokeRef.current && activeStrokeRef.current.length > 0) {
                strokesRef.current.push(activeStrokeRef.current);
                setStrokeCount(strokesRef.current.length);
                updateStrokeProcessing();
                refreshDrawingCanvas();
                logTrackingEvent('TRACER_END', `Tracer path ended on hand loss (${activeStrokeRef.current.length} points)`);
              }
              activeStrokeRef.current = null;
            } else {
              // Pinch mode grace period handling
              if (isTrackingInGracePeriod(consecutiveMissedFramesRef.current, elapsed)) {
                isGraceActiveRef.current = true;
                if (activeStrokeRef.current && !strokeSuspendedRef.current) {
                  strokeSuspendedRef.current = {
                    stroke: activeStrokeRef.current,
                    startTime: now,
                    lastPoint: activeStrokeRef.current[activeStrokeRef.current.length - 1],
                  };
                  activeStrokeRef.current = null;
                  logTrackingEvent('STROKE_SUSPENDED', `Hand lost - suspended stroke for grace window`);
                }
              } else {
                // Genuine tracking loss confirmed
                isGraceActiveRef.current = false;
                landmarksSmootherRef.current.reset();
                rawDetectionRef.current = null;
                smoothedDetectionRef.current = null;
                lastRawIndexTipRef.current = null;

                let committedOnLoss = false;
                if (strokeSuspendedRef.current) {
                  if (strokeSuspendedRef.current.stroke.length > 0) {
                    strokesRef.current.push(strokeSuspendedRef.current.stroke);
                    setStrokeCount(strokesRef.current.length);
                    committedOnLoss = true;
                  }
                  logTrackingEvent('STROKE_SPLIT', 'Tracking lost beyond grace limit - committed stroke');
                  strokeSuspendedRef.current = null;
                }
                if (activeStrokeRef.current) {
                  if (activeStrokeRef.current.length > 0) {
                    strokesRef.current.push(activeStrokeRef.current);
                    setStrokeCount(strokesRef.current.length);
                    committedOnLoss = true;
                  }
                  activeStrokeRef.current = null;
                }
                if (committedOnLoss) {
                  updateStrokeProcessing();
                  refreshDrawingCanvas();
                }
                isPinchingRef.current = false;
                unpinchedFramesRef.current = 0;
              }
            }
          }

          // Populate real-time per-frame diagnostic telemetry object
          const rawTip = rawDetection?.landmarks?.[INDEX_FINGER_TIP_INDEX];
          const rawThumb = rawDetection?.landmarks?.[THUMB_TIP_INDEX];
          const smoothedTip = smoothedDetectionRef.current?.indexFingertip;

          const sPinch = smoothedTip && smoothedDetectionRef.current?.thumbTip
            ? calculatePinchDistance(smoothedDetectionRef.current.thumbTip, smoothedTip)
            : null;
          const rPinch = rawThumb && rawTip
            ? calculatePinchDistance(rawThumb, rawTip)
            : null;
          const effPinch = (sPinch !== null && rPinch !== null)
            ? calculateEffectivePinchDistance(sPinch, rPinch)
            : (sPinch !== null ? sPinch : rPinch);

          diagnosticFrameRef.current = {
            rawTip: rawTip ? {
              normX: Number(rawTip.x.toFixed(4)),
              normY: Number(rawTip.y.toFixed(4)),
              pixelX: Math.round((1 - rawTip.x) * displayWidth),
              pixelY: Math.round(rawTip.y * displayHeight),
            } : null,
            filteredTip: smoothedTip ? {
              normX: Number(smoothedTip.x.toFixed(4)),
              normY: Number(smoothedTip.y.toFixed(4)),
              pixelX: Math.round((1 - smoothedTip.x) * displayWidth),
              pixelY: Math.round(smoothedTip.y * displayHeight),
            } : null,
            rawThumbTip: rawThumb ? {
              normX: Number(rawThumb.x.toFixed(4)),
              normY: Number(rawThumb.y.toFixed(4)),
              pixelX: Math.round((1 - rawThumb.x) * displayWidth),
              pixelY: Math.round(rawThumb.y * displayHeight),
            } : null,
            filterOffsetNorm: (rawTip && smoothedTip)
              ? Number(Math.hypot(rawTip.x - smoothedTip.x, rawTip.y - smoothedTip.y).toFixed(4))
              : 0,
            filterOffsetPx: (rawTip && smoothedTip)
              ? Math.round(Math.hypot((rawTip.x - smoothedTip.x) * displayWidth, (rawTip.y - smoothedTip.y) * displayHeight))
              : 0,
            rawPinchDistance: rPinch !== null ? Number(rPinch.toFixed(4)) : null,
            smoothedPinchDistance: sPinch !== null ? Number(sPinch.toFixed(4)) : null,
            effectivePinchDistance: effPinch !== null ? Number(effPinch.toFixed(4)) : null,
            pixelPinchDistance: (rawThumb && rawTip)
              ? Math.round(Math.hypot((rawThumb.x - rawTip.x) * displayWidth, (rawThumb.y - rawTip.y) * displayHeight))
              : null,
            isPinching: isPinchingRef.current,
            trackingState: lastTrackingStateRef.current,
            drawingState: prevDrawingStateRef.current,
            isFrameRejected: frameRejected,
            rejectionCategory,
            rejectionReason,
            frameIntervalMs,
            fingertipVelocity: {
              speedNormPerSec: Number(speedNormPerSec.toFixed(3)),
              speedPxPerSec,
              vxPxPerSec,
              vyPxPerSec,
            },
            boundaryStatus: rawDetection?.landmarks
              ? checkHandBoundaryProximity(rawDetection.landmarks)
              : { isNearEdge: false, isWristClipped: false, minMargin: 0, clippedLandmarks: [], boundaryWarning: null },
            lastTransition: {
              type: lastTrackingStateRef.current,
              reason: rejectionReason,
              timestampMs: Math.round(now),
            },
          };
        }

        // 3. Continuous overlay rendering at display refresh rate (60/85/120 FPS)
        const currentSmoothed = smoothedDetectionRef.current;
        const isGrace = isGraceActiveRef.current;
        const isGenuinelyLost = isTrackingGenuinelyLost(
          consecutiveMissedFramesRef.current,
          now - lastSuccessfulDetectionTimestampRef.current
        );
        const isDetected = !isGenuinelyLost && !!currentSmoothed;

        // Compute current pinch distance (2D image plane, robust to differential filter lag)
        let currentPinchDistance = null;
        if (isDetected && currentSmoothed && currentSmoothed.thumbTip && currentSmoothed.indexFingertip) {
          const sDist = calculatePinchDistance(currentSmoothed.thumbTip, currentSmoothed.indexFingertip);
          const rDist = rawDetectionRef.current?.thumbTip && rawDetectionRef.current?.indexFingertip
            ? calculatePinchDistance(rawDetectionRef.current.thumbTip, rawDetectionRef.current.indexFingertip)
            : sDist;
          currentPinchDistance = calculateEffectivePinchDistance(sDist, rDist);
        }

        // Render Tracking Overlay
        const tCtx = trackingCanvas.getContext('2d');
        if (tCtx) {
          renderTrackingOverlay(
            tCtx,
            displayWidth,
            displayHeight,
            isDetected ? currentSmoothed : null,
            isPinchingRef.current || !!strokeSuspendedRef.current,
            currentPinchDistance,
            isGrace,
            rawDetectionRef.current,
            diagnosticFrameRef.current,
            showDiagnosticsRef.current
          );
        }

        // 4. Determine UI State and Throttled React Updates
        let currentDrawingState = 'no_hand';
        if (isDetected || strokeSuspendedRef.current) {
          if (captureModeRef.current === 'continuous') {
            currentDrawingState = 'drawing';
          } else {
            currentDrawingState = isPinchingRef.current || strokeSuspendedRef.current ? 'drawing' : 'ready';
          }
        }

        const stateChanged = currentDrawingState !== prevDrawingStateRef.current;
        const shouldUpdateReact = stateChanged || now - lastReactStateUpdateRef.current > 100;

        if (shouldUpdateReact) {
          prevDrawingStateRef.current = currentDrawingState;
          lastReactStateUpdateRef.current = now;

          setDrawingState(currentDrawingState);
          setRejectionCounters({ ...rejectionCountersRef.current });

          const diag = diagnosticFrameRef.current;
          const rawTip = diag.rawTip || (rawDetectionRef.current?.indexFingertip ? {
            normX: Number((1 - rawDetectionRef.current.indexFingertip.x).toFixed(3)),
            normY: Number(rawDetectionRef.current.indexFingertip.y.toFixed(3)),
            normZ: Number((rawDetectionRef.current.indexFingertip.z || 0).toFixed(3)),
            pixelX: Math.round((1 - rawDetectionRef.current.indexFingertip.x) * displayWidth),
            pixelY: Math.round(rawDetectionRef.current.indexFingertip.y * displayHeight),
          } : null);

          const filteredTip = currentSmoothed?.indexFingertip ? {
            normX: Number((1 - currentSmoothed.indexFingertip.x).toFixed(3)),
            normY: Number(currentSmoothed.indexFingertip.y.toFixed(3)),
            normZ: Number((currentSmoothed.indexFingertip.z || 0).toFixed(3)),
            pixelX: Math.round((1 - currentSmoothed.indexFingertip.x) * displayWidth),
            pixelY: Math.round(currentSmoothed.indexFingertip.y * displayHeight),
          } : null;

          if (isDetected && filteredTip) {
            setTrackingInfo({
              handedness: currentSmoothed.handedness,
              confidence: currentSmoothed.confidence,
              indexTip: filteredTip,
              rawTip,
              filteredTip,
              rawThumbTip: diag.rawThumbTip,
              filterOffsetNorm: diag.filterOffsetNorm,
              filterOffsetPx: diag.filterOffsetPx,
              pinchDistance: currentPinchDistance !== null ? Number(currentPinchDistance.toFixed(3)) : null,
              rawPinchDistance: diag.rawPinchDistance,
              smoothedPinchDistance: diag.smoothedPinchDistance,
              effectivePinchDistance: diag.effectivePinchDistance,
              pixelPinchDistance: diag.pixelPinchDistance,
              isPinching: isPinchingRef.current,
              captureMode: captureModeRef.current,
              fps: displayFpsRef.current,
              inferenceFps: inferenceFpsRef.current,
              inferenceDurationMs: inferenceDurationMsRef.current,
              videoTime: Number(video.currentTime.toFixed(3)),
              inferenceTimestamp: Math.round(lastInferenceTimestampRef.current),
              isInferring: isInferringRef.current,
              handDetected: consecutiveMissedFramesRef.current === 0,
              missedFrames: consecutiveMissedFramesRef.current,
              isGraceActive: isGrace,
              fingertipStable: fingertipStabilityRef.current.isStable,
              fingertipReason: fingertipStabilityRef.current.reason,
              isFrameRejected: diag.isFrameRejected,
              rejectionCategory: diag.rejectionCategory,
              rejectionReason: diag.rejectionReason,
              velocity: diag.fingertipVelocity,
              boundaryStatus: diag.boundaryStatus,
              rejectionCounters: { ...rejectionCountersRef.current },
              eventLog: [...eventLogRef.current],
            });
          } else {
            setTrackingInfo((prev) => ({
              ...prev,
              handedness: null,
              confidence: null,
              indexTip: null,
              rawTip: null,
              filteredTip: null,
              rawThumbTip: null,
              pinchDistance: null,
              rawPinchDistance: null,
              smoothedPinchDistance: null,
              effectivePinchDistance: null,
              pixelPinchDistance: null,
              isPinching: false,
              captureMode: captureModeRef.current,
              fps: displayFpsRef.current,
              inferenceFps: inferenceFpsRef.current,
              inferenceDurationMs: inferenceDurationMsRef.current,
              videoTime: Number(video.currentTime.toFixed(3)),
              inferenceTimestamp: Math.round(lastInferenceTimestampRef.current),
              isInferring: isInferringRef.current,
              handDetected: false,
              missedFrames: consecutiveMissedFramesRef.current,
              isGraceActive: isGrace,
              fingertipStable: fingertipStabilityRef.current.isStable,
              fingertipReason: fingertipStabilityRef.current.reason,
              isFrameRejected: diag.isFrameRejected,
              rejectionCategory: diag.rejectionCategory,
              rejectionReason: diag.rejectionReason,
              velocity: diag.fingertipVelocity,
              boundaryStatus: {
                isNearEdge: false,
                isWristClipped: false,
                minMargin: 0,
                clippedLandmarks: [],
                warning: null,
              },
              rejectionCounters: { ...rejectionCountersRef.current },
              eventLog: [...eventLogRef.current],
            }));
          }
        }
      }

      animFrameIdRef.current = requestAnimationFrame(processFrame);
    };

    animFrameIdRef.current = requestAnimationFrame(processFrame);
  }, [videoRef, renderTrackingOverlay, refreshDrawingCanvas, logTrackingEvent, updateStrokeProcessing]);

  /**
   * Stop tracking loop and clean up temporary active drawing state.
   * Note: Completed strokes in strokesRef are safely PRESERVED!
   */
  const stopTrackingLoop = useCallback(() => {
    if (!isTrackingActiveRef.current) return;
    isTrackingActiveRef.current = false;
    logTrackingEvent('TRACKING_STOP', 'Tracking loop stopped');

    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }

    landmarksSmootherRef.current.reset();
    rawDetectionRef.current = null;
    smoothedDetectionRef.current = null;
    consecutiveMissedFramesRef.current = 0;
    lastSuccessfulDetectionTimestampRef.current = 0;
    isGraceActiveRef.current = false;
    isInferringRef.current = false;
    lastInferenceTimestampRef.current = 0;
    lastInferenceTimeRef.current = 0;
    unpinchedFramesRef.current = 0;
    lastTrackingStateRef.current = 'NONE';

    let committedOnStop = false;
    if (strokeSuspendedRef.current) {
      if (strokeSuspendedRef.current.stroke.length > 0) {
        strokesRef.current.push(strokeSuspendedRef.current.stroke);
        setStrokeCount(strokesRef.current.length);
        committedOnStop = true;
      }
      strokeSuspendedRef.current = null;
    }

    if (activeStrokeRef.current) {
      if (activeStrokeRef.current.length > 0) {
        strokesRef.current.push(activeStrokeRef.current);
        setStrokeCount(strokesRef.current.length);
        committedOnStop = true;
      }
      activeStrokeRef.current = null;
    }
    if (committedOnStop) {
      updateStrokeProcessing();
      refreshDrawingCanvas();
    }
    isPinchingRef.current = false;

    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }

    lastVideoTimeRef.current = -1;
    prevDrawingStateRef.current = 'no_hand';
    setDrawingState('no_hand');
    setTrackingInfo({
      handedness: null,
      confidence: null,
      indexTip: null,
      rawTip: null,
      filteredTip: null,
      pinchDistance: null,
      isPinching: false,
      fps: 0,
      inferenceFps: 0,
      inferenceDurationMs: 0,
      videoTime: 0,
      inferenceTimestamp: 0,
      isInferring: false,
      handDetected: false,
      missedFrames: 0,
      isGraceActive: false,
      fingertipStable: true,
      fingertipReason: '',
      eventLog: [...eventLogRef.current],
    });
  }, [logTrackingEvent, refreshDrawingCanvas, updateStrokeProcessing]);

  // Initialize model on mount
  useEffect(() => {
    let isCancelled = false;

    async function init() {
      try {
        await getHandLandmarker();
        if (!isCancelled) {
          setModelState('ready');
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('Failed to load MediaPipe Hand Landmarker:', err);
          setModelState('error');
          setModelError(err.message || 'Failed to load hand tracking model.');
        }
      }
    }

    init();

    return () => {
      isCancelled = true;
      disposeHandLandmarker();
    };
  }, []);

  // Synchronize tracking loop with camera state and model readiness
  useEffect(() => {
    if (cameraActive && modelState === 'ready') {
      startTrackingLoop();
    } else {
      stopTrackingLoop();
    }

    return () => {
      stopTrackingLoop();
    };
  }, [cameraActive, modelState, startTrackingLoop, stopTrackingLoop]);

  return {
    canvasRef,
    drawingCanvasRef,
    modelState,
    modelError,
    drawingState,
    strokeCount,
    trackingInfo,
    loadModel,
    clearWriting,
    // Milestone 4: Stroke Processing & Visualization
    processedData,
    renderMode,
    setRenderMode,
    reprocessStrokes: updateStrokeProcessing,
    // Diagnostic Controls & Isolation
    captureMode,
    setCaptureMode,
    rejectionCounters,
    resetDiagnosticCounters,
  };
}
