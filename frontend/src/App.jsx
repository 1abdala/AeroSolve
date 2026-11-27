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
                Milestone 5 implements local symbol recognition for digits 0–9: offline in-browser geometric feature classification with Top-3 candidate predictions, confidence scoring, sub-millisecond inference, and interactive dataset collection.
              </p>
            </div>
            <BackendStatus />
          </div>

          {/* Central Camera, Hand Tracking, Air-Writing & Stroke Processing Workspace */}
          <CameraPreview />

          {/* Architecture & Milestone Scope Notice */}
          <div className="foundation-info-grid">
            <div className="info-card">
              <div className="info-icon">⚡</div>
              <div className="info-body">
                <h3>Modular Pipeline</h3>
                <p>
                  Pure functional pipeline with deep-cloning immutability guarantees: Sanitization → Binomial Smoothing → Arc-Length Resampling → Aspect-Ratio Preserving Normalization.
                </p>
              </div>
            </div>

            <div className="info-card">
              <div className="info-icon">📐</div>
              <div className="info-body">
                <h3>Geometry Preservation</h3>
                <p>
                  Uniform scale factor preserves aspect ratios and multi-stroke mathematical spatial relationships (minus signs, fraction bars, division dots, plus signs).
                </p>
              </div>
            </div>

            <div className="info-card">
              <div className="info-icon">🎯</div>
              <div className="info-body">
                <h3>Local Recognition (M5)</h3>
                <p>
                  Evaluates processed strokes using a canonical 76-dimensional feature vector with sub-millisecond latency, zero external API dependencies, and built-in dataset labeling.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <div className="footer-container">
          <p className="footer-copy">
            <strong>AeroSolve</strong> &copy; {CURRENT_YEAR} — Milestone 5 (Local Symbol Recognition).
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
