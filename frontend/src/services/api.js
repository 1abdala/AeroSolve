/**
 * API service for communicating with the AeroSolve FastAPI backend.
 * Uses VITE_API_BASE_URL from environment with fallback to http://localhost:8000.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

/**
 * Check backend health status by calling GET /api/health.
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function checkBackendHealth() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(`${API_BASE_URL}/api/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        error: `Server responded with HTTP status ${response.status}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      data,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    let errorMessage = 'Unable to reach backend server.';
    if (err.name === 'AbortError') {
      errorMessage = 'Backend connection timed out (6s).';
    } else if (err.message) {
      errorMessage = err.message;
    }
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export { API_BASE_URL };
