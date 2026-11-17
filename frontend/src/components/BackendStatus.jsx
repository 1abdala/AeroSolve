import React, { useState, useEffect, useCallback } from 'react';
import { checkBackendHealth, API_BASE_URL } from '../services/api';

/**
 * BackendStatus Component
 * Displays real-time connectivity status to the FastAPI backend with retry capability.
 */
export default function BackendStatus() {
  const [status, setStatus] = useState('checking'); // 'checking' | 'connected' | 'disconnected'
  const [details, setDetails] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastChecked, setLastChecked] = useState(null);

  const performHealthCheck = useCallback(async () => {
    setStatus('checking');
    setErrorMessage('');
    const result = await checkBackendHealth();

    setLastChecked(new Date().toLocaleTimeString());

    if (result.success) {
      setStatus('connected');
      setDetails(result.data);
    } else {
      setStatus('disconnected');
      setErrorMessage(result.error || 'Failed to reach backend');
      setDetails(null);
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function initialCheck() {
      const result = await checkBackendHealth();
      if (!isCancelled) {
        setLastChecked(new Date().toLocaleTimeString());
        if (result.success) {
          setStatus('connected');
          setDetails(result.data);
        } else {
          setStatus('disconnected');
          setErrorMessage(result.error || 'Failed to reach backend');
          setDetails(null);
        }
      }
    }

    initialCheck();

    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <div className="backend-status-card" role="region" aria-label="Backend Connection Status">
      <div className="status-header">
        <div className="status-label-group">
          <span className="section-title">Backend Service</span>
          <span className="api-url-badge" title="Target Backend URL">
            {API_BASE_URL}
          </span>
        </div>

        <div className="status-pill-group">
          {status === 'checking' && (
            <span className="status-pill pill-warning">
              <span className="spinner-dot" aria-hidden="true"></span>
              Checking connection...
            </span>
          )}
          {status === 'connected' && (
            <span className="status-pill pill-success">
              <span className="status-dot dot-live" aria-hidden="true"></span>
              Connected
            </span>
          )}
          {status === 'disconnected' && (
            <span className="status-pill pill-danger">
              <span className="status-dot dot-error" aria-hidden="true"></span>
              Disconnected
            </span>
          )}

          <button
            onClick={performHealthCheck}
            disabled={status === 'checking'}
            className="btn-retry"
            title="Retry backend health check"
            aria-label="Retry backend connection check"
          >
            <svg
              className={`retry-icon ${status === 'checking' ? 'rotating' : ''}`}
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            Retry
          </button>
        </div>
      </div>

      <div className="status-content">
        {status === 'connected' && details && (
          <div className="status-details success-details">
            <span className="detail-item">
              <strong>App:</strong> {details.application || 'AeroSolve'}
            </span>
            <span className="detail-divider">•</span>
            <span className="detail-item">
              <strong>Status:</strong> {details.status}
            </span>
            <span className="detail-divider">•</span>
            <span className="detail-item">
              <strong>Message:</strong> {details.message}
            </span>
            {lastChecked && (
              <span className="detail-timestamp">Checked at {lastChecked}</span>
            )}
          </div>
        )}

        {status === 'disconnected' && (
          <div className="status-details error-details">
            <p className="error-text">
              <strong>Connection Error:</strong> {errorMessage}
            </p>
            <p className="error-hint">
              Ensure FastAPI backend is running at <code>{API_BASE_URL}</code>.
              Run: <code>cd backend && uvicorn app.main:app --reload</code>
            </p>
          </div>
        )}

        {status === 'checking' && (
          <div className="status-details checking-details">
            <span className="checking-text">Pinging <code>{API_BASE_URL}/api/health</code>...</span>
          </div>
        )}
      </div>
    </div>
  );
}
