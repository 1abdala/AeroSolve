import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getHandLandmarker,
  detectHandInVideo,
  disposeHandLandmarker,
  INDEX_FINGER_TIP_INDEX,
  HAND_CONNECTIONS,
} from '../services/handTracking';

// Landmark index for the index fingertip
export { INDEX_FINGER_TIP_INDEX };

/**
 * Custom hook for managing MediaPipe Hand Landmarker lifecycle,
 * video processing animation loop, and 60 FPS canvas rendering.
 */
export function useHandTracking({ videoRef, cameraActive, showSkeleton = true }) {
  // Model state: 'loading' | 'ready' | 'error'
  const [modelState, setModelState] = useState('loading');
  const [modelError, setModelError] = useState(null);

  // Hand tracking state (throttled for React UI)
  const [handDetected, setHandDetected] = useState(false);
  const [trackingInfo, setTrackingInfo] = useState({
    handedness: null,
    confidence: null,
    indexTip: null,
    fps: 0,
  });

  const canvasRef = useRef(null);
  const animFrameIdRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const isTrackingActiveRef = useRef(false);
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(0);
  const currentFpsRef = useRef(0);
  const prevDetectedRef = useRef(false);
  const lastReactStateUpdateRef = useRef(0);

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
   * Draw hand landmarks, skeleton, and index fingertip tracking indicator.
   */
  const renderTrackingOverlay = useCallback(
    (ctx, canvasWidth, canvasHeight, detectionResult) => {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      if (!detectionResult || !detectionResult.detected || !detectionResult.landmarks) {
        return;
      }

      const landmarks = detectionResult.landmarks;

      // 1. Draw Skeleton Connections if enabled
      if (showSkeleton) {
        ctx.save();
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)'; // Electric Cyan

        for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
          const startLm = landmarks[startIdx];
          const endLm = landmarks[endIdx];

          if (startLm && endLm) {
            // Horizontal mirror mapping: canvasX = (1 - lm.x) * width
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

        // 2. Draw Landmark Node Points (0..20, except fingertip 8 which gets special target)
        ctx.save();
        for (let i = 0; i < landmarks.length; i++) {
          if (i === INDEX_FINGER_TIP_INDEX) continue; // Highlighted separately

          const lm = landmarks[i];
          const x = (1 - lm.x) * canvasWidth;
          const y = lm.y * canvasHeight;

          ctx.beginPath();
          ctx.arc(x, y, 3.5, 0, 2 * Math.PI);
          ctx.fillStyle = '#60a5fa';
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.stroke();
        }
        ctx.restore();
      }

      // 3. Highlight Index Fingertip (Landmark 8) with Prominent Target Reticle
      const indexTip = detectionResult.indexFingertip;
      if (indexTip) {
        // Mirrored coordinate:
        const tipX = (1 - indexTip.x) * canvasWidth;
        const tipY = indexTip.y * canvasHeight;
        const now = performance.now();

        ctx.save();

        // Outer pulsing glow ring
        const pulse = Math.sin(now / 150) * 3;
        const outerRadius = Math.max(12, 18 + pulse);

        ctx.beginPath();
        ctx.arc(tipX, tipY, outerRadius, 0, 2 * Math.PI);
        ctx.strokeStyle = '#38bdf8'; // Cyan
        ctx.lineWidth = 2;
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 12;
        ctx.stroke();

        // Secondary inner target ring
        ctx.beginPath();
        ctx.arc(tipX, tipY, 9, 0, 2 * Math.PI);
        ctx.strokeStyle = '#2563eb'; // Blue
        ctx.lineWidth = 2;
        ctx.stroke();

        // Solid core center dot
        ctx.beginPath();
        ctx.arc(tipX, tipY, 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#0284c7';
        ctx.stroke();

        // Sleek Tooltip / Tag next to fingertip
        const labelX = tipX + 16 > canvasWidth - 140 ? tipX - 135 : tipX + 16;
        const labelY = tipY - 16 < 30 ? tipY + 30 : tipY - 16;

        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(11, 15, 25, 0.85)';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.lineWidth = 1;

        // Rounded box
        const boxWidth = 125;
        const boxHeight = 36;
        ctx.beginPath();
        ctx.roundRect(labelX, labelY - 16, boxWidth, boxHeight, 6);
        ctx.fill();
        ctx.stroke();

        // Text inside tooltip
        ctx.font = '600 11px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText('INDEX FINGERTIP', labelX + 8, labelY - 2);

        ctx.font = '500 10px "JetBrains Mono", monospace';
        ctx.fillStyle = '#94a3b8';
        const displayNormX = (1 - indexTip.x).toFixed(2);
        const displayNormY = indexTip.y.toFixed(2);
        ctx.fillText(`x: ${displayNormX}  y: ${displayNormY}`, labelX + 8, labelY + 12);

        ctx.restore();
      }
    },
    [showSkeleton]
  );

  /**
   * Main tracking loop running on requestAnimationFrame.
   */
  const startTrackingLoop = useCallback(() => {
    if (isTrackingActiveRef.current) return;
    isTrackingActiveRef.current = true;

    const processFrame = () => {
      if (!isTrackingActiveRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState >= 2 && !video.paused && !video.ended) {
        // Match internal canvas pixel buffer to actual client display resolution
        const displayWidth = video.clientWidth;
        const displayHeight = video.clientHeight;

        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
          canvas.width = displayWidth;
          canvas.height = displayHeight;
        }

        // Only process new frames to avoid redundant GPU/CPU inference
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

          // Render visual overlay
          const ctx = canvas.getContext('2d');
          if (ctx) {
            renderTrackingOverlay(ctx, canvas.width, canvas.height, detection);
          }

          // Throttle React state updates to avoid unnecessary 60fps re-renders
          const isDetected = !!(detection && detection.detected);
          const shouldUpdateReact =
            isDetected !== prevDetectedRef.current || now - lastReactStateUpdateRef.current > 150;

          if (shouldUpdateReact) {
            prevDetectedRef.current = isDetected;
            lastReactStateUpdateRef.current = now;

            setHandDetected(isDetected);
            if (isDetected && detection.indexFingertip) {
              setTrackingInfo({
                handedness: detection.handedness,
                confidence: detection.confidence,
                indexTip: {
                  // Normalized coordinates
                  normX: Number((1 - detection.indexFingertip.x).toFixed(3)),
                  normY: Number(detection.indexFingertip.y.toFixed(3)),
                  normZ: Number(detection.indexFingertip.z.toFixed(3)),
                  // Display pixel coordinates
                  pixelX: Math.round((1 - detection.indexFingertip.x) * canvas.width),
                  pixelY: Math.round(detection.indexFingertip.y * canvas.height),
                },
                fps: currentFpsRef.current,
              });
            } else {
              setTrackingInfo((prev) => ({
                ...prev,
                handedness: null,
                confidence: null,
                indexTip: null,
                fps: currentFpsRef.current,
              }));
            }
          }
        }
      }

      animFrameIdRef.current = requestAnimationFrame(processFrame);
    };

    animFrameIdRef.current = requestAnimationFrame(processFrame);
  }, [videoRef, renderTrackingOverlay]);

  /**
   * Stop tracking loop and clear overlay.
   */
  const stopTrackingLoop = useCallback(() => {
    if (!isTrackingActiveRef.current) return;
    isTrackingActiveRef.current = false;

    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }

    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }

    lastVideoTimeRef.current = -1;
    prevDetectedRef.current = false;
    setHandDetected(false);
    setTrackingInfo({
      handedness: null,
      confidence: null,
      indexTip: null,
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
    modelState,
    modelError,
    handDetected,
    trackingInfo,
    loadModel,
  };
}
