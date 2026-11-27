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

/**
 * Save a single genuine sample to the backend dataset storage.
 * @param {object} sample
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function saveDatasetSample(sample) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/dataset/sample`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sample),
    });
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Bulk synchronize a list of samples from localStorage with backend dataset storage.
 * @param {Array<object>} samples
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function syncDatasetCorpus(samples) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/dataset/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ samples }),
    });
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Fetch all collected genuine samples and statistics from backend.
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function fetchDatasetStats() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/dataset/samples`);
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export { API_BASE_URL };
