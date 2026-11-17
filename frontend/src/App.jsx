import React from 'react';
import Header from './components/Header';
import BackendStatus from './components/BackendStatus';
import CameraPreview from './components/CameraPreview';
import './App.css';

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Main App Component for AeroSolve (Milestone 2)
 */
export default function App() {
  return (
    <div className="aerosolve-app">
      <Header />

      <main className="main-content">
        <div className="content-container">
          {/* Top Row: System Status Banner */}
          <div className="system-overview-card">
            <div className="overview-header">
              <h2>System Integration Status</h2>
              <p className="overview-description">
                Milestone 2 integrates Google MediaPipe Hand Landmarker for real-time 21-landmark hand detection and index fingertip tracking directly over the live webcam feed.
              </p>
            </div>
            <BackendStatus />
          </div>

          {/* Central Camera & Hand Tracking Workspace */}
          <CameraPreview />

          {/* Architecture & Milestone Scope Notice */}
          <div className="foundation-info-grid">
            <div className="info-card">
              <div className="info-icon">✋</div>
              <div className="info-body">
                <h3>MediaPipe Hand Landmarker</h3>
                <p>
                  Runs in <code>VIDEO</code> mode with single-hand detection. Identifies all 21 3D landmarks and tracks index fingertip (Landmark #8) with sub-pixel precision.
                </p>
              </div>
            </div>

            <div className="info-card">
              <div className="info-icon">⚡</div>
              <div className="info-body">
                <h3>High-Performance Rendering</h3>
                <p>
                  Zero-overhead 60 FPS canvas overlay decoupled from React re-renders. Synchronizes coordinate mirroring with the user-facing selfie webcam feed.
                </p>
              </div>
            </div>

            <div className="info-card">
              <div className="info-icon">🔒</div>
              <div className="info-body">
                <h3>Client-Side Privacy</h3>
                <p>
                  Inference runs entirely in the browser via WebAssembly (WASM) and WebGL. No video streams, landmarks, or biometric telemetry leave your device.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <div className="footer-container">
          <p className="footer-copy">
            <strong>AeroSolve</strong> &copy; {CURRENT_YEAR} — Milestone 2 (Hand Tracking with MediaPipe).
          </p>
          <div className="footer-links">
            <span className="footer-tag">Python 3.15 + FastAPI</span>
            <span className="footer-tag">React 19 + Vite</span>
            <span className="footer-tag">MediaPipe Tasks Vision</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
