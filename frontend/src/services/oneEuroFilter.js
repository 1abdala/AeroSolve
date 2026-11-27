/**
 * One Euro Filter (1€ Filter) for Low-Latency Real-Time Smoothing
 * Reference: Casiez, G., Roussel, N. and Vogel, F. (2012).
 * "1 € Filter: A Simple Speed-based Low-pass Filter for Noisy Input in HCI".
 * Proceedings of the SIGCHI Conference on Human Factors in Computing Systems (CHI '12), pp. 2527-2530.
 *
 * Designed to eliminate jitter at low speeds while dynamically increasing cutoff
 * frequency at high speeds to avoid lag during fast hand movements.
 */

class LowPassFilter {
  constructor(alpha = 1.0, initVal = 0.0) {
    this.y = initVal;
    this.s = initVal;
    this.setAlpha(alpha);
    this.initialized = false;
  }

  setAlpha(alpha) {
    this.alpha = Math.max(0.0, Math.min(1.0, alpha));
  }

  filter(val) {
    if (!this.initialized) {
      this.s = val;
      this.y = val;
      this.initialized = true;
      return val;
    }
    this.y = this.alpha * val + (1.0 - this.alpha) * this.s;
    this.s = this.y;
    return this.y;
  }

  reset() {
    this.initialized = false;
  }
}

/**
 * 1D One Euro Filter
 */
export class OneEuroFilter {
  /**
   * @param {number} minCutoff - Minimum cutoff frequency in Hz (controls stationary jitter, e.g. 1.2 - 1.8)
   * @param {number} beta - Speed coefficient in normalized coordinates (controls lag during fast motion, e.g. 15.0 - 25.0)
   * @param {number} dCutoff - Cutoff frequency for derivative in Hz (e.g. 2.5 - 3.5 for responsive velocity adaptation)
   */
  constructor(minCutoff = 1.6, beta = 22.0, dCutoff = 3.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;

    this.xFilter = new LowPassFilter();
    this.dxFilter = new LowPassFilter();
    this.lastTime = null;
    this.lastRaw = null;
  }

  computeAlpha(cutoff, dt) {
    const tau = 1.0 / (2.0 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  filter(val, timestampSec) {
    if (this.lastTime === null || timestampSec <= this.lastTime || (timestampSec - this.lastTime) > 0.5) {
      // First frame or tracking resumed after interruption (> 500ms):
      // Reset immediately to avoid stale dragging or teleportation
      this.lastTime = timestampSec;
      this.lastRaw = val;
      this.xFilter.reset();
      this.dxFilter.reset();
      return this.xFilter.filter(val);
    }

    const dt = Math.max(1e-4, timestampSec - this.lastTime);
    this.lastTime = timestampSec;

    // Estimate derivative (velocity): dx / dt
    const dx = (val - this.lastRaw) / dt;
    this.lastRaw = val;

    // Filter derivative
    this.dxFilter.setAlpha(this.computeAlpha(this.dCutoff, dt));
    const edx = this.dxFilter.filter(dx);

    // Dynamic cutoff frequency: increases with velocity
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);

    // Filter position
    this.xFilter.setAlpha(this.computeAlpha(cutoff, dt));
    return this.xFilter.filter(val);
  }

  reset() {
    this.lastTime = null;
    this.lastRaw = null;
    this.xFilter.reset();
    this.dxFilter.reset();
  }
}

/**
 * 3D One Euro Filter for a single hand landmark (x, y, z)
 */
export class OneEuroFilter3D {
  constructor(minCutoff = 1.6, beta = 22.0, dCutoff = 3.0) {
    this.xFilter = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.yFilter = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.zFilter = new OneEuroFilter(minCutoff, beta, dCutoff);
  }

  filter(point, timestampSec) {
    if (!point) return null;
    return {
      x: this.xFilter.filter(point.x, timestampSec),
      y: this.yFilter.filter(point.y, timestampSec),
      z: point.z !== undefined ? this.zFilter.filter(point.z, timestampSec) : 0,
    };
  }

  reset() {
    this.xFilter.reset();
    this.yFilter.reset();
    this.zFilter.reset();
  }
}

/**
 * Hand Landmarks Smoother managing filters for all 21 hand landmarks.
 */
export class HandLandmarksSmoother {
  constructor(minCutoff = 1.6, beta = 22.0, dCutoff = 3.0) {
    this.filters = Array.from({ length: 21 }, () => new OneEuroFilter3D(minCutoff, beta, dCutoff));
    this.isTracking = false;
  }

  /**
   * Smooth an array of 21 landmarks.
   * @param {Array<{x: number, y: number, z?: number}>} landmarks
   * @param {number} timestampSec - Timestamp in seconds
   * @returns {Array<{x: number, y: number, z: number}>|null}
   */
  smooth(landmarks, timestampSec) {
    if (!landmarks || landmarks.length < 21) {
      this.reset();
      return null;
    }

    this.isTracking = true;
    return landmarks.map((lm, i) => this.filters[i].filter(lm, timestampSec));
  }

  /**
   * Reset all landmark filters on tracking loss or hand switch.
   */
  reset() {
    if (this.isTracking) {
      for (const filter of this.filters) {
        filter.reset();
      }
      this.isTracking = false;
    }
  }
}
