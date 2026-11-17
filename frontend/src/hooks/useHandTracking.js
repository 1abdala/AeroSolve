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
  calculateLandmarkDistance,
  updatePinchHysteresis,
  mapNormalizedToCanvas,
  renderStrokesToCanvas,
  PINCH_START_THRESHOLD,
  PINCH_RELEASE_THRESHOLD,
  MIN_POINT_DISTANCE,
} from '../services/airWriting';

export { INDEX_FINGER_TIP_INDEX, THUMB_TIP_INDEX };

/**
 * Custom hook for managing MediaPipe Hand Landmarker lifecycle,
 * real-time video processing, pinch gesture air-writing, and 60 FPS canvas rendering.
 */
export function useHandTracking({ videoRef, cameraActive, showSkeleton = true }) {
  // Model state: 'loading' | 'ready' | 'error'
  const [modelState, setModelState] = useState('loading');
  const [modelError, setModelError] = useState(null);

  // Hand tracking & air-writing UI states (throttled)
  const [handDetected, setHandDetected] = useState(false);
  const [drawingState, setDrawingState] = useState('no_hand'); // 'no_hand' | 'ready' | 'drawing'
  const [strokeCount, setStrokeCount] = useState(0);
  const [trackingInfo, setTrackingInfo] = useState({
    handedness: null,
    confidence: null,
    indexTip: null,
    pinchDistance: null,
    isPinching: false,
    fps: 0,
  });

  // Canvas references
  const canvasRef = useRef(null);          // Layer 3: Tracking reticle, skeleton, HUD (cleared every frame)
  const drawingCanvasRef = useRef(null);   // Layer 2: Persistent air-writing ink strokes

  // Stroke and pinch state references (high-frequency, avoids React re-renders)
  const strokesRef = useRef([]);           // Completed strokes: Array<Array<{x, y}>>
  const activeStrokeRef = useRef(null);    // Current in-progress stroke: Array<{x, y}> | null
  const isPinchingRef = useRef(false);     // Current hysteresis pinch state

  // Animation and performance refs
  const animFrameIdRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const isTrackingActiveRef = useRef(false);
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(0);
  const currentFpsRef = useRef(0);
  const prevDrawingStateRef = useRef('no_hand');
  const lastReactStateUpdateRef = useRef(0);
  const lastCanvasDimensionsRef = useRef({ width: 0, height: 0 });

  /**
   * Pre-load or initialize HandLandmarker model.
   */
  const loadModel = useCallback(async () => {
    try {
      setModelError(null);
      await getHandLandmarker();
      setModelState('ready');
    } catch (err) {
      console.error('Failed to load MediaPipe Hand Landmarker:', err);
      setModelState('error');
      setModelError(err.message || 'Failed to load hand tracking model.');
    }
  }, []);

  /**
   * Clear all drawn air-writing strokes.
   */
  const clearWriting = useCallback(() => {
    strokesRef.current = [];
    activeStrokeRef.current = null;
    isPinchingRef.current = false;
    setStrokeCount(0);

    const dCanvas = drawingCanvasRef.current;
    if (dCanvas) {
      const ctx = dCanvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, dCanvas.width, dCanvas.height);
      }
    }
  }, []);

  /**
   * Redraw all stored strokes on the drawing canvas (e.g. after window resize).
   */
  const refreshDrawingCanvas = useCallback(() => {
    const dCanvas = drawingCanvasRef.current;
    if (!dCanvas) return;

    const ctx = dCanvas.getContext('2d');
    if (!ctx) return;

    // Combine completed strokes and active stroke for full redraw
    const allStrokes = [...strokesRef.current];
    if (activeStrokeRef.current && activeStrokeRef.current.length > 0) {
      allStrokes.push(activeStrokeRef.current);
    }

    renderStrokesToCanvas(ctx, allStrokes, dCanvas.width, dCanvas.height, {
      strokeStyle: '#38bdf8',
      lineWidth: 4.5,
      shadowColor: 'rgba(56, 189, 248, 0.45)',
      shadowBlur: 8,
    });
  }, []);

  /**
   * Draw the visual tracking overlay (reticle, skeleton, pinch guide) on the tracking canvas.
   */
  const renderTrackingOverlay = useCallback(
    (ctx, canvasWidth, canvasHeight, detectionResult, isPinching, pinchDist) => {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      if (!detectionResult || !detectionResult.detected || !detectionResult.landmarks) {
        return;
      }

      const landmarks = detectionResult.landmarks;
      const indexTip = detectionResult.indexFingertip;
      const thumbTip = detectionResult.thumbTip;

      // 1. Draw Skeleton Connections if enabled
      if (showSkeleton) {
        ctx.save();
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';

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
          ctx.fillStyle = '#60a5fa';
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
        // If close or pinching, show connection guide
        if (pinchDist < 0.16 || isPinching) {
          ctx.beginPath();
          ctx.moveTo(thumbX, thumbY);
          ctx.lineTo(tipX, tipY);
          ctx.lineWidth = isPinching ? 3 : 1.5;
          ctx.strokeStyle = isPinching
            ? 'rgba(52, 211, 153, 0.9)' // Vibrant Emerald when pinched
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

      // 3. Highlight Index Fingertip (Landmark 8) with Target Reticle & Pinch State
      if (indexTip) {
        const tipX = (1 - indexTip.x) * canvasWidth;
        const tipY = indexTip.y * canvasHeight;
        const now = performance.now();

        ctx.save();

        if (isPinching) {
          // --- ACTIVE DRAWING STATE RETICLE (Emerald / Cyan Ink Flow) ---
          const pulse = Math.sin(now / 100) * 4;
          const outerRadius = Math.max(14, 20 + pulse);

          // Outer glowing ink-flow aura
          ctx.beginPath();
          ctx.arc(tipX, tipY, outerRadius, 0, 2 * Math.PI);
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2.5;
          ctx.shadowColor = '#10b981';
          ctx.shadowBlur = 16;
          ctx.stroke();

          // Inner solid core ring
          ctx.beginPath();
          ctx.arc(tipX, tipY, 7, 0, 2 * Math.PI);
          ctx.fillStyle = '#34d399';
          ctx.shadowBlur = 0;
          ctx.fill();

          // Pen tip center dot
          ctx.beginPath();
          ctx.arc(tipX, tipY, 3, 0, 2 * Math.PI);
          ctx.fillStyle = '#ffffff';
          ctx.fill();

          // Sleek Badge: DRAWING
          const labelX = tipX + 16 > canvasWidth - 145 ? tipX - 145 : tipX + 16;
          const labelY = tipY - 16 < 30 ? tipY + 30 : tipY - 16;

          ctx.fillStyle = 'rgba(6, 78, 59, 0.9)';
          ctx.strokeStyle = 'rgba(52, 211, 153, 0.7)';
          ctx.lineWidth = 1;

          ctx.beginPath();
          ctx.roundRect(labelX, labelY - 14, 132, 34, 6);
          ctx.fill();
          ctx.stroke();

          ctx.font = '700 11px Inter, system-ui, sans-serif';
          ctx.fillStyle = '#6ee7b7';
          ctx.fillText('● DRAWING ACTIVE', labelX + 8, labelY);

          ctx.font = '500 10px "JetBrains Mono", monospace';
          ctx.fillStyle = '#a7f3d0';
          ctx.fillText(`Pinch dist: ${(pinchDist || 0).toFixed(3)}`, labelX + 8, labelY + 12);
        } else {
          // --- READY STATE RETICLE (Cyan Tracking Target) ---
          const pulse = Math.sin(now / 150) * 3;
          const outerRadius = Math.max(12, 18 + pulse);

          ctx.beginPath();
          ctx.arc(tipX, tipY, outerRadius, 0, 2 * Math.PI);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 10;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(tipX, tipY, 8, 0, 2 * Math.PI);
          ctx.strokeStyle = '#2563eb';
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
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
          ctx.lineWidth = 1;

          ctx.beginPath();
          ctx.roundRect(labelX, labelY - 14, 140, 34, 6);
          ctx.fill();
          ctx.stroke();

          ctx.font = '600 11px Inter, system-ui, sans-serif';
          ctx.fillStyle = '#38bdf8';
          ctx.fillText('INDEX TIP (READY)', labelX + 8, labelY);

          ctx.font = '500 10px "JetBrains Mono", monospace';
          ctx.fillStyle = '#94a3b8';
          ctx.fillText('Pinch to write', labelX + 8, labelY + 12);
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

          // Redraw existing strokes to match new canvas scale
          refreshDrawingCanvas();
        }

        // Only process new frames to avoid redundant inference
        if (video.currentTime !== lastVideoTimeRef.current) {
          lastVideoTimeRef.current = video.currentTime;

          const now = performance.now();
          const detection = detectHandInVideo(video, now);

          // Calculate FPS
          frameCountRef.current += 1;
          if (now - lastFpsUpdateRef.current >= 500) {
            currentFpsRef.current = Math.round(
              (frameCountRef.current * 1000) / (now - lastFpsUpdateRef.current)
            );
            frameCountRef.current = 0;
            lastFpsUpdateRef.current = now;
          }

          let isDetected = false;
          let pinchDistance = null;
          let newIsPinching = false;

          if (detection && detection.detected && detection.indexFingertip && detection.thumbTip) {
            isDetected = true;

            // 1. Calculate normalized Euclidean distance between thumb and index tip
            pinchDistance = calculateLandmarkDistance(detection.thumbTip, detection.indexFingertip);

            // 2. Determine pinch state using hysteresis
            newIsPinching = updatePinchHysteresis(
              isPinchingRef.current,
              pinchDistance,
              PINCH_START_THRESHOLD,
              PINCH_RELEASE_THRESHOLD
            );

            // 3. Handle Air-Writing Stroke Lifecycle
            const indexTip = detection.indexFingertip;
            const currentPoint = { x: indexTip.x, y: indexTip.y };

            if (newIsPinching) {
              const dCtx = drawingCanvas.getContext('2d');

              if (!isPinchingRef.current) {
                // --- STROKE START ---
                activeStrokeRef.current = [currentPoint];
                // Draw initial contact dot
                if (dCtx) {
                  const pt = mapNormalizedToCanvas(currentPoint, displayWidth, displayHeight);
                  dCtx.save();
                  dCtx.fillStyle = '#38bdf8';
                  dCtx.shadowColor = 'rgba(56, 189, 248, 0.5)';
                  dCtx.shadowBlur = 6;
                  dCtx.beginPath();
                  dCtx.arc(pt.x, pt.y, 2.25, 0, 2 * Math.PI);
                  dCtx.fill();
                  dCtx.restore();
                }
              } else if (activeStrokeRef.current && activeStrokeRef.current.length > 0) {
                // --- STROKE CONTINUATION ---
                const lastPoint = activeStrokeRef.current[activeStrokeRef.current.length - 1];
                const deltaDist = Math.hypot(
                  currentPoint.x - lastPoint.x,
                  currentPoint.y - lastPoint.y
                );

                if (deltaDist >= MIN_POINT_DISTANCE) {
                  activeStrokeRef.current.push(currentPoint);

                  // Incrementally render line segment to drawing canvas
                  if (dCtx) {
                    const p1 = mapNormalizedToCanvas(lastPoint, displayWidth, displayHeight);
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
                }
              }
            } else {
              // --- STROKE END (Pinch Released) ---
              if (isPinchingRef.current && activeStrokeRef.current) {
                if (activeStrokeRef.current.length > 0) {
                  strokesRef.current.push(activeStrokeRef.current);
                  setStrokeCount(strokesRef.current.length);
                }
                activeStrokeRef.current = null;
              }
            }

            isPinchingRef.current = newIsPinching;
          } else {
            // --- TRACKING LOST (Hand out of view) ---
            if (activeStrokeRef.current) {
              if (activeStrokeRef.current.length > 0) {
                strokesRef.current.push(activeStrokeRef.current);
                setStrokeCount(strokesRef.current.length);
              }
              activeStrokeRef.current = null;
            }
            isPinchingRef.current = false;
          }

          // 4. Render Tracking Overlay & Reticle
          const tCtx = trackingCanvas.getContext('2d');
          if (tCtx) {
            renderTrackingOverlay(
              tCtx,
              displayWidth,
              displayHeight,
              detection,
              isPinchingRef.current,
              pinchDistance
            );
          }

          // 5. Determine Drawing UI State
          let currentDrawingState = 'no_hand';
          if (isDetected) {
            currentDrawingState = isPinchingRef.current ? 'drawing' : 'ready';
          }

          // 6. Throttle React State Updates
          const stateChanged = currentDrawingState !== prevDrawingStateRef.current;
          const shouldUpdateReact = stateChanged || now - lastReactStateUpdateRef.current > 150;

          if (shouldUpdateReact) {
            prevDrawingStateRef.current = currentDrawingState;
            lastReactStateUpdateRef.current = now;

            setHandDetected(isDetected);
            setDrawingState(currentDrawingState);

            if (isDetected && detection.indexFingertip) {
              setTrackingInfo({
                handedness: detection.handedness,
                confidence: detection.confidence,
                indexTip: {
                  normX: Number((1 - detection.indexFingertip.x).toFixed(3)),
                  normY: Number(detection.indexFingertip.y.toFixed(3)),
                  normZ: Number(detection.indexFingertip.z.toFixed(3)),
                  pixelX: Math.round((1 - detection.indexFingertip.x) * displayWidth),
                  pixelY: Math.round(detection.indexFingertip.y * displayHeight),
                },
                pinchDistance: pinchDistance !== null ? Number(pinchDistance.toFixed(3)) : null,
                isPinching: isPinchingRef.current,
                fps: currentFpsRef.current,
              });
            } else {
              setTrackingInfo((prev) => ({
                ...prev,
                handedness: null,
                confidence: null,
                indexTip: null,
                pinchDistance: null,
                isPinching: false,
                fps: currentFpsRef.current,
              }));
            }
          }
        }
      }

      animFrameIdRef.current = requestAnimationFrame(processFrame);
    };

    animFrameIdRef.current = requestAnimationFrame(processFrame);
  }, [videoRef, renderTrackingOverlay, refreshDrawingCanvas]);

  /**
   * Stop tracking loop and clean up temporary active drawing state.
   * Note: Completed strokes in strokesRef are safely PRESERVED!
   */
  const stopTrackingLoop = useCallback(() => {
    if (!isTrackingActiveRef.current) return;
    isTrackingActiveRef.current = false;

    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }

    // Safely finalize active stroke if interrupted
    if (activeStrokeRef.current) {
      if (activeStrokeRef.current.length > 0) {
        strokesRef.current.push(activeStrokeRef.current);
        setStrokeCount(strokesRef.current.length);
      }
      activeStrokeRef.current = null;
    }
    isPinchingRef.current = false;

    // Clear tracking reticle canvas (completed strokes on drawingCanvas remain untouched)
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }

    lastVideoTimeRef.current = -1;
    prevDrawingStateRef.current = 'no_hand';
    setHandDetected(false);
    setDrawingState('no_hand');
    setTrackingInfo({
      handedness: null,
      confidence: null,
      indexTip: null,
      pinchDistance: null,
      isPinching: false,
      fps: 0,
    });
  }, []);

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
    handDetected,
    drawingState,
    strokeCount,
    trackingInfo,
    loadModel,
    clearWriting,
  };
}
