import React from 'react';

/**
 * Header Component
 * Displays AeroSolve branding, title, and current milestone version.
 */
export default function Header() {
  return (
    <header className="app-header">
      <div className="header-container">
        <div className="brand-group">
          <div className="brand-logo-icon">
            <svg
              viewBox="0 0 32 32"
              width="28"
              height="28"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect width="32" height="32" rx="8" fill="url(#brand-grad)" />
              {/* Stylized Air-Writing Wave + Math symbol */}
              <path
                d="M8 20C11 14 14 14 17 19C20 24 23 23 25 12"
                stroke="#FFFFFF"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="25" cy="12" r="2.5" fill="#38BDF8" />
              <defs>
                <linearGradient id="brand-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#2563EB" />
                  <stop offset="1" stopColor="#7C3AED" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="brand-text">
            <h1 className="app-title">AeroSolve</h1>
            <p className="app-subtitle">AI-Powered Air-Writing Mathematics Learning</p>
          </div>
        </div>

        <div className="header-meta">
          <span className="milestone-pill" title="Current Development Stage">
            <span className="pill-dot"></span>
            Milestone 2: Hand Tracking
          </span>
        </div>
      </div>
    </header>
  );
}
