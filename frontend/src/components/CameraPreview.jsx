import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useHandTracking } from '../hooks/useHandTracking';

/**
 * CameraPreview Component (Milestone 3: Air-Writing Interaction)
 * Manages webcam acquisition via navigator.mediaDevices.getUserMedia(),
 * renders live video feed, provides start/stop controls, and integrates
 * real-time MediaPipe hand tracking, pinch gesture detection, and persistent
 * air-writing canvas drawing.
 */
export default function CameraPreview() {
  // Camera state: 'idle' | 'starting' | 'active' | 'error'
  const [cameraState, setCameraState] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [errorType, setErrorType] = useState('');
  const [deviceLabel, setDeviceLabel] = useState('');
  const [videoResolution, setVideoResolution] = useState(null);
  const [showSkeleton, setShowSkeleton] = useState(true);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Milestone 3: Hand Tracking & Air-Writing Hook
  const {
    canvasRef,
    drawingCanvasRef,
    modelState,
    modelError,
    drawingState,
    strokeCount,
    trackingInfo,
    loadModel,
    clearWriting,
  } = useHandTracking({
    videoRef,
    cameraActive: cameraState === 'active',
    showSkeleton,
  });

  /**
   * Helper to stop all active media tracks and clear video source.
   */
  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Error stopping media track:', e);
        }
      });
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  /**
   * Stop camera feed and reset state to idle.
   * Note: Completed air-writing strokes are preserved!
   */
  const stopCamera = useCallback(() => {
    stopTracks();
    setCameraState('idle');
    setErrorMessage('');
    setErrorType('');
    setDeviceLabel('');
    setVideoResolution(null);
  }, [stopTracks]);

  /**
   * Start camera feed by requesting user media.
   * Invoked ONLY on explicit user action (button click).
   */
  const startCamera = async () => {
    stopTracks();
    setErrorMessage('');
    setErrorType('');
    setCameraState('starting');

    if (
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setCameraState('error');
      setErrorType('UnsupportedBrowser');
      setErrorMessage(
        'Webcam access is not supported by your browser or environment. Please use an updated modern browser (Chrome, Edge, Firefox, Safari) over HTTPS or localhost.'
      );
      return;
    }

    const constraints = {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user',
      },
      audio: false,
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current
              .play()
              .then(() => {
                setCameraState('active');
                setVideoResolution({
                  width: videoRef.current.videoWidth,
                  height: videoRef.current.videoHeight,
                });
              })
              .catch((playErr) => {
                console.error('Video play error:', playErr);
                setCameraState('error');
                setErrorType('PlayError');
                setErrorMessage('Unable to start video playback. Please try again.');
              });
          }
        };

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          setDeviceLabel(videoTrack.label || 'Webcam Active');

          videoTrack.onended = () => {
            stopCamera();
          };
        }
      }
    } catch (err) {
      console.error('Camera startup error:', err);
      stopTracks();
      setCameraState('error');

      switch (err.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
          setErrorType('PermissionDenied');
          setErrorMessage(
            'Camera permission was denied. Please allow camera access in your browser settings and click "Start Camera" again.'
          );
          break;

        case 'NotFoundError':
        case 'DevicesNotFoundError':
          setErrorType('NotFound');
          setErrorMessage(
            'No camera hardware detected. Please plug in or enable a webcam device and try again.'
          );
          break;

        case 'NotReadableError':
        case 'TrackStartError':
          setErrorType('NotReadable');
          setErrorMessage(
            'The camera is currently busy or being used by another application. Please close other apps and try again.'
          );
          break;

        case 'OverconstrainedError':
          setErrorType('Overconstrained');
          setErrorMessage(
            'The requested camera resolution or settings are not supported by your hardware.'
          );
          break;

        case 'SecurityError':
          setErrorType('Security');
          setErrorMessage(
            'Camera access was blocked due to security policies. Ensure you are accessing via http://localhost or HTTPS.'
          );
          break;

        default:
          setErrorType('Unknown');
          setErrorMessage(
            err.message || 'An unknown error occurred while trying to initialize the camera.'
          );
          break;
      }
    }
  };

  /**
   * Cleanup on unmount: stop all active tracks.
   */
  useEffect(() => {
    return () => {
      stopTracks();
    };
  }, [stopTracks]);

  return (
    <section className="camera-section" aria-label="Webcam Preview and Air-Writing Controls">
      <div className="camera-viewport-card">
        {/* Top Status & Controls Toolbar */}
        <div className="camera-toolbar">
          <div className="camera-info-group">
            <span className="camera-title">Live Air-Writing Workspace</span>
            {cameraState === 'active' && deviceLabel && (
              <span className="device-tag" title={deviceLabel}>
                {deviceLabel}
              </span>
            )}
          </div>

          <div className="camera-status-badge-container">
            {/* Camera Status Badge */}
            {cameraState === 'idle' && (
              <span className="status-badge badge-idle">
                <span className="status-indicator-dot dot-idle"></span>
                Camera Inactive
              </span>
            )}
            {cameraState === 'starting' && (
              <span className="status-badge badge-starting">
                <span className="mini-spinner" aria-hidden="true"></span>
                Camera Starting...
              </span>
            )}
            {cameraState === 'active' && (
              <span className="status-badge badge-active">
                <span className="status-indicator-dot dot-live-pulse"></span>
                Camera Live
              </span>
            )}
            {cameraState === 'error' && (
              <span className="status-badge badge-error">
                <span className="status-indicator-dot dot-error"></span>
                Camera Error
              </span>
            )}

            {/* MediaPipe Model Status Badge */}
            {modelState === 'loading' && (
              <span className="status-badge badge-starting" title="Loading MediaPipe Hand Landmarker model">
                <span className="mini-spinner" aria-hidden="true"></span>
                Loading Model...
              </span>
            )}
            {modelState === 'error' && (
              <span className="status-badge badge-error" title={modelError}>
                <span className="status-indicator-dot dot-error"></span>
                Model Error
              </span>
            )}

            {/* Milestone 3: Air-Writing Drawing Status Badge */}
            {modelState === 'ready' && cameraState === 'active' && (
              <>
                {drawingState === 'no_hand' && (
                  <span className="status-badge badge-idle" title="No hand detected in camera frame">
                    <span className="status-indicator-dot dot-idle"></span>
                    Hand Not Detected
                  </span>
                )}
                {drawingState === 'ready' && (
                  <span className="status-badge badge-ready" title="Hand detected! Pinch index finger and thumb to write.">
                    <span className="status-indicator-dot dot-ready"></span>
                    Ready (Pinch to Write)
                  </span>
                )}
                {drawingState === 'drawing' && (
                  <span className="status-badge badge-drawing" title="Pinch active! Air-writing in progress.">
                    <span className="status-indicator-dot dot-drawing-pulse"></span>
                    ● Drawing
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Video, Drawing Canvas & Tracking Canvas Viewport */}
        <div
          className="video-container"
          style={{
            aspectRatio: videoResolution ? `${videoResolution.width} / ${videoResolution.height}` : '16 / 9',
          }}
        >
          {/* Layer 1: Native HTML5 Video Element */}
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            className={`camera-video-element ${cameraState === 'active' ? 'visible' : 'hidden'}`}
            aria-label="Webcam feed"
          />

          {/* Layer 2: Persistent Air-Writing Ink Canvas (Milestone 3) */}
          <canvas
            ref={drawingCanvasRef}
            className="air-writing-canvas visible"
            aria-label="Air-writing drawing layer"
          />

          {/* Layer 3: Ephemeral Tracking Reticle & Skeleton Overlay Canvas */}
          <canvas
            ref={canvasRef}
            className={`tracking-overlay-canvas ${cameraState === 'active' ? 'visible' : 'hidden'}`}
            aria-hidden="true"
          />

          {/* Idle Placeholder */}
          {cameraState === 'idle' && (
            <div className="camera-placeholder idle-placeholder">
              <div className="placeholder-icon-wrap">
                <svg
                  className="camera-icon-large"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
              <h3 className="placeholder-heading">Camera is Inactive</h3>
              <p className="placeholder-subtext">
                Click <strong>"Start Camera"</strong> below to grant webcam permission, track your hand, and begin air-writing.
              </p>
              <div className="privacy-callout">
                <svg
                  className="shield-icon"
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>Air-writing and MediaPipe run locally in your browser. No video is recorded or uploaded.</span>
              </div>
            </div>
          )}

          {/* Starting / Loading Overlay */}
          {cameraState === 'starting' && (
            <div className="camera-placeholder starting-placeholder" aria-live="polite">
              <div className="loading-spinner-ring"></div>
              <h3 className="placeholder-heading">Starting Camera...</h3>
              <p className="placeholder-subtext">
                Requesting camera access. Please approve the browser prompt if prompted.
              </p>
            </div>
          )}

          {/* Camera Error Message Overlay */}
          {cameraState === 'error' && (
            <div className="camera-placeholder error-placeholder" role="alert">
              <div className="error-icon-wrap">
                <svg
                  className="error-icon-large"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h3 className="error-heading">Camera Unavailable</h3>
              <p className="error-description">{errorMessage}</p>
              {errorType === 'PermissionDenied' && (
                <div className="error-tip">
                  <strong>How to fix:</strong> Click the camera icon in your browser URL bar, change Camera to <em>Allow</em>, and click "Start Camera" again.
                </div>
              )}
            </div>
          )}

          {/* Live Stream Overlay Metadata */}
          {cameraState === 'active' && videoResolution && (
            <div className="live-overlay-tag">
              <span>● AIR-WRITING ACTIVE</span>
              <span>{videoResolution.width} × {videoResolution.height}</span>
              {trackingInfo.fps > 0 && <span>• {trackingInfo.fps} FPS</span>}
              {strokeCount > 0 && <span className="stroke-pill">{strokeCount} {strokeCount === 1 ? 'stroke' : 'strokes'}</span>}
            </div>
          )}
        </div>

        {/* Action Controls & Settings */}
        <div className="camera-actions-bar">
          <div className="button-group">
            <button
              onClick={startCamera}
              disabled={cameraState === 'active' || cameraState === 'starting'}
              className="btn btn-primary btn-start"
              id="btn-start-camera"
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Start Camera
            </button>

            <button
              onClick={stopCamera}
              disabled={cameraState === 'idle' || cameraState === 'starting'}
              className="btn btn-secondary btn-stop"
              id="btn-stop-camera"
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              Stop Camera
            </button>

            {/* Milestone 3: Clear Writing Button */}
            <button
              onClick={clearWriting}
              disabled={strokeCount === 0}
              className="btn btn-clear-writing"
              id="btn-clear-writing"
              title="Clear all air-writing strokes from the canvas"
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              Clear Writing {strokeCount > 0 ? `(${strokeCount})` : ''}
            </button>

            {/* Toggle Skeleton Overlay */}
            <button
              onClick={() => setShowSkeleton((prev) => !prev)}
              disabled={cameraState !== 'active'}
              className={`btn btn-toggle-skeleton ${showSkeleton ? 'active' : ''}`}
              title="Toggle 21 hand landmarks and skeleton connections"
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8M6 14v-2a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6a7 7 0 0 0 7 7h1a7 7 0 0 0 7-7v-3a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2" />
              </svg>
              {showSkeleton ? 'Hide Skeleton' : 'Show Skeleton'}
            </button>
          </div>

          <div className="action-hint">
            {modelState === 'error' && (
              <button onClick={loadModel} className="btn-retry-model">
                Retry Model Load
              </button>
            )}
            {cameraState === 'active' && drawingState === 'drawing' && (
              <span className="hint-text drawing-hint">
                Pinch held — drawing stroke with index finger. Release pinch to finish stroke.
              </span>
            )}
            {cameraState === 'active' && drawingState === 'ready' && (
              <span className="hint-text ready-hint">
                Pinch your index finger and thumb together to write.
              </span>
            )}
            {cameraState === 'active' && drawingState === 'no_hand' && (
              <span className="hint-text">
                Bring your hand into view to activate air-writing.
              </span>
            )}
            {cameraState === 'idle' && (
              <span className="hint-text">
                Webcam is offline. Click Start Camera to begin air-writing.
              </span>
            )}
          </div>
        </div>

        {/* Milestone 3: Fingertip & Air-Writing Telemetry Bar */}
        {cameraState === 'active' && (
          <div className="tracking-telemetry-bar">
            <div className="telemetry-item">
              <span className="telemetry-label">Status:</span>
              <span className={`telemetry-value ${
                drawingState === 'drawing' ? 'val-drawing' : drawingState === 'ready' ? 'val-ready' : 'val-muted'
              }`}>
                {drawingState === 'drawing' ? 'Drawing Active' : drawingState === 'ready' ? 'Ready (Open)' : 'No Hand'}
              </span>
            </div>

            <div className="telemetry-divider">|</div>

            <div className="telemetry-item">
              <span className="telemetry-label">Pinch Distance:</span>
              <span className={`telemetry-value ${trackingInfo.isPinching ? 'val-drawing' : ''}`}>
                {trackingInfo.pinchDistance !== null
                  ? `${trackingInfo.pinchDistance.toFixed(3)} ${trackingInfo.isPinching ? '(Pinching)' : '(Open)'}`
                  : '—'}
              </span>
            </div>

            <div className="telemetry-divider">|</div>

            <div className="telemetry-item">
              <span className="telemetry-label">Strokes:</span>
              <span className="telemetry-value val-engine">
                {strokeCount} completed
              </span>
            </div>

            <div className="telemetry-divider">|</div>

            <div className="telemetry-item">
              <span className="telemetry-label">Tip (Pixel):</span>
              <span className="telemetry-value">
                {trackingInfo.indexTip
                  ? `${trackingInfo.indexTip.pixelX}px, ${trackingInfo.indexTip.pixelY}px`
                  : '—'}
              </span>
            </div>

            <div className="telemetry-divider">|</div>

            <div className="telemetry-item">
              <span className="telemetry-label">Rate:</span>
              <span className="telemetry-value val-engine">
                {trackingInfo.fps || 0} FPS
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
