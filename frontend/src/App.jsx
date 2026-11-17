import React from 'react';
import Header from './components/Header';
import BackendStatus from './components/BackendStatus';
import CameraPreview from './components/CameraPreview';
import './App.css';

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Main App Component for AeroSolve (Milestone 3: Air-Writing Interaction)
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
                Milestone 3 implements full air-writing interaction: write in the air using your index finger, with a hysteresis-stabilized pinch gesture controlling stroke creation and persistent ink rendering.
              </p>
            </div>
            <BackendStatus />
          </div>

          {/* Central Camera, Hand Tracking & Air-Writing Workspace */}
          <CameraPreview />

          {/* Architecture & Milestone Scope Notice */}
          <div className="foundation-info-grid">
            <div className="info-card">
              <div className="info-icon">✍️</div>
              <div className="info-body">
                <h3>Pinch-to-Write Gesture</h3>
                <p>
                  Calculates normalized Euclidean distance between thumb tip (#4) and index tip (#8). Dual-threshold hysteresis prevents stroke flicker and false starts.
                </p>
              </div>
            </div>

            <div className="info-card">
              <div className="info-icon">🎨</div>
              <div className="info-body">
                <h3>Dual-Canvas Architecture</h3>
                <p>
                  Layered architecture with an ephemeral 60 FPS tracking overlay and a dedicated persistent ink layer that preserves completed strokes during tracking pauses and resizing.
                </p>
              </div>
            </div>

            <div className="info-card">
              <div className="info-icon">🔒</div>
              <div className="info-body">
                <h3>Local & Responsive</h3>
                <p>
                  Zero network latency with client-side MediaPipe inference. Full mirror alignment ensures index fingertip writing matches screen ink effortlessly.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <div className="footer-container">
          <p className="footer-copy">
            <strong>AeroSolve</strong> &copy; {CURRENT_YEAR} — Milestone 3 (Air-Writing Interaction).
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
