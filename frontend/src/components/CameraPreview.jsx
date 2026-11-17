import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useHandTracking } from '../hooks/useHandTracking';

/**
 * CameraPreview Component (Milestone 2)
 * Manages webcam acquisition via navigator.mediaDevices.getUserMedia(),
 * renders live video feed, provides start/stop controls, and integrates
 * real-time MediaPipe hand and index fingertip tracking with canvas overlay.
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

  // Milestone 2: Hand Tracking Hook
  const {
    canvasRef,
    modelState,
    modelError,
    handDetected,
    trackingInfo,
    loadModel,
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

    // 1. Check if mediaDevices API is supported by the browser
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

    // 2. Request user media constraints
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
   * Cleanup on unmount: stop all active tracks to prevent background recording.
   */
  useEffect(() => {
    return () => {
      stopTracks();
    };
  }, [stopTracks]);

  return (
    <section className="camera-section" aria-label="Webcam Preview and Hand Tracking Controls">
      <div className="camera-viewport-card">
        {/* Top Status & Controls Toolbar */}
        <div className="camera-toolbar">
          <div className="camera-info-group">
            <span className="camera-title">Live Camera Stream</span>
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
            {modelState === 'ready' && cameraState === 'active' && (
              <>
                {handDetected ? (
                  <span className="status-badge badge-active" title="Hand actively detected in view">
                    <span className="status-indicator-dot dot-live-pulse"></span>
                    Hand Detected {trackingInfo.handedness ? `(${trackingInfo.handedness})` : ''}
                  </span>
                ) : (
                  <span className="status-badge badge-idle" title="No hand visible in current frame">
                    <span className="status-indicator-dot dot-idle"></span>
                    No Hand Detected
                  </span>
                )}
              </>
            )}
            {modelState === 'error' && (
              <span className="status-badge badge-error" title={modelError}>
                <span className="status-indicator-dot dot-error"></span>
                Model Error
              </span>
            )}
          </div>
        </div>

        {/* Video & Tracking Canvas Viewport */}
        <div
          className="video-container"
          style={{
            aspectRatio: videoResolution ? `${videoResolution.width} / ${videoResolution.height}` : '16 / 9',
          }}
        >
          {/* Native HTML5 Video Element */}
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            className={`camera-video-element ${cameraState === 'active' ? 'visible' : 'hidden'}`}
            aria-label="Webcam feed"
          />

          {/* Milestone 2: Hand Tracking Overlay Canvas */}
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
                Click <strong>"Start Camera"</strong> below to grant webcam permission and view live hand tracking.
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
                <span>MediaPipe runs locally in your browser. No video or hand data is stored or uploaded.</span>
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
              <span>● REC LOCAL</span>
              <span>{videoResolution.width} × {videoResolution.height}</span>
              {trackingInfo.fps > 0 && <span>• {trackingInfo.fps} FPS</span>}
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
            {cameraState === 'active' && handDetected && (
              <span className="hint-text active-hint">
                Tracking index fingertip (Landmark #8). Move your hand to test tracking.
              </span>
            )}
            {cameraState === 'active' && !handDetected && (
              <span className="hint-text">
                Position your hand in front of the camera to begin tracking.
              </span>
            )}
            {cameraState === 'idle' && (
              <span className="hint-text">
                Webcam is offline. Click Start Camera to begin.
              </span>
            )}
          </div>
        </div>

        {/* Milestone 2: Fingertip Telemetry & Landmark Inspector Panel */}
        {cameraState === 'active' && (
          <div className="tracking-telemetry-bar">
            <div className="telemetry-item">
              <span className="telemetry-label">Hand State:</span>
              <span className={`telemetry-value ${handDetected ? 'val-active' : 'val-muted'}`}>
                {handDetected ? `Detected (${trackingInfo.handedness || 'Hand'})` : 'No Hand Detected'}
              </span>
            </div>

            <div className="telemetry-divider">|</div>

            <div className="telemetry-item">
              <span className="telemetry-label">Index Tip (Norm):</span>
              <span className="telemetry-value">
                {trackingInfo.indexTip
                  ? `x: ${trackingInfo.indexTip.normX.toFixed(3)}, y: ${trackingInfo.indexTip.normY.toFixed(3)}, z: ${trackingInfo.indexTip.normZ.toFixed(3)}`
                  : '—'}
              </span>
            </div>

            <div className="telemetry-divider">|</div>

            <div className="telemetry-item">
              <span className="telemetry-label">Index Tip (Pixels):</span>
              <span className="telemetry-value">
                {trackingInfo.indexTip
                  ? `${trackingInfo.indexTip.pixelX}px, ${trackingInfo.indexTip.pixelY}px`
                  : '—'}
              </span>
            </div>

            <div className="telemetry-divider">|</div>

            <div className="telemetry-item">
              <span className="telemetry-label">Tracking Engine:</span>
              <span className="telemetry-value val-engine">
                MediaPipe Video ({trackingInfo.fps || 0} FPS)
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
