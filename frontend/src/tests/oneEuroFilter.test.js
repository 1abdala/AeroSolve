import { describe, it, expect } from 'vitest';
import {
  OneEuroFilter,
  OneEuroFilter3D,
  HandLandmarksSmoother,
} from '../services/oneEuroFilter';

describe('OneEuroFilter 1D', () => {
  it('initializes with the first raw value without delay', () => {
    const filter = new OneEuroFilter(1.2, 12.0, 1.0);
    const initialVal = 0.5;
    const filtered = filter.filter(initialVal, 0.0);
    expect(filtered).toBe(initialVal);
  });

  it('smooths high-frequency jitter at low velocities (stationary hand)', () => {
    const filter = new OneEuroFilter(1.2, 12.0, 1.0);
    let time = 0.0;
    const dt = 1 / 60; // 60 FPS

    // Initialize at center
    filter.filter(0.5, time);

    // Simulate small jitter around 0.5 (±0.005)
    const rawValues = [0.505, 0.495, 0.504, 0.496, 0.503];
    const filteredValues = [];

    for (const val of rawValues) {
      time += dt;
      filteredValues.push(filter.filter(val, time));
    }

    // Filtered values should have lower variance and stay closer to 0.5
    for (const fVal of filteredValues) {
      expect(Math.abs(fVal - 0.5)).toBeLessThan(0.005);
    }
  });

  it('adapts cutoff frequency during fast movements to minimize lag', () => {
    const filter = new OneEuroFilter(1.2, 12.0, 1.0);
    let time = 0.0;
    const dt = 1 / 60;

    filter.filter(0.1, time);

    // Fast movement: hand moves from 0.1 to 0.8 in 5 frames
    const fastValues = [0.24, 0.38, 0.52, 0.66, 0.80];
    let lastFiltered = 0.1;

    for (const val of fastValues) {
      time += dt;
      lastFiltered = filter.filter(val, time);
    }

    // At high speed, the filter should closely follow the fast-moving target without lag
    expect(lastFiltered).toBeGreaterThan(0.70);
  });

  it('resets immediately on tracking loss or large time gap without stale dragging', () => {
    const filter = new OneEuroFilter(1.2, 12.0, 1.0);

    // Hand was at left side (x = 0.1)
    filter.filter(0.1, 1.0);
    filter.filter(0.1, 1.016);

    // Hand leaves frame and returns 1 second later at right side (x = 0.9)
    // Time delta > 0.5s triggers automatic stale-reset
    const resumedFiltered = filter.filter(0.9, 2.5);

    // Must snap immediately to 0.9 rather than interpolating from 0.1
    expect(resumedFiltered).toBe(0.9);
  });

  it('resets state on explicit reset() call', () => {
    const filter = new OneEuroFilter(1.2, 12.0, 1.0);

    filter.filter(0.2, 1.0);
    filter.filter(0.22, 1.016);

    filter.reset();

    // After reset, next value acts as clean initialization
    const result = filter.filter(0.85, 1.032);
    expect(result).toBe(0.85);
  });
});

describe('OneEuroFilter3D', () => {
  it('smooths 3D landmarks independently', () => {
    const filter3D = new OneEuroFilter3D(1.2, 12.0, 1.0);
    const p1 = { x: 0.5, y: 0.5, z: -0.05 };
    const res1 = filter3D.filter(p1, 0.0);

    expect(res1.x).toBe(0.5);
    expect(res1.y).toBe(0.5);
    expect(res1.z).toBe(-0.05);

    const p2 = { x: 0.505, y: 0.495, z: -0.048 };
    const res2 = filter3D.filter(p2, 0.016);

    expect(res2.x).toBeCloseTo(0.5, 2);
    expect(res2.y).toBeCloseTo(0.5, 2);
  });
});

describe('HandLandmarksSmoother (21 Landmarks)', () => {
  it('smooths all 21 hand landmarks simultaneously', () => {
    const smoother = new HandLandmarksSmoother(1.2, 12.0, 1.0);

    const mockLandmarks = Array.from({ length: 21 }, (_, i) => ({
      x: 0.1 + i * 0.03,
      y: 0.2 + i * 0.02,
      z: 0.0,
    }));

    const smoothed = smoother.smooth(mockLandmarks, 1.0);
    expect(smoothed).not.toBeNull();
    expect(smoothed.length).toBe(21);
    expect(smoothed[8].x).toBe(mockLandmarks[8].x); // Index tip
  });

  it('resets cleanly when null or invalid landmarks are passed', () => {
    const smoother = new HandLandmarksSmoother(1.2, 12.0, 1.0);

    const mockLandmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0.0 }));
    smoother.smooth(mockLandmarks, 1.0);
    expect(smoother.isTracking).toBe(true);

    // Tracking lost
    const lostResult = smoother.smooth(null, 1.016);
    expect(lostResult).toBeNull();
    expect(smoother.isTracking).toBe(false);

    // Tracking returns at new location
    const newLandmarks = Array.from({ length: 21 }, () => ({ x: 0.9, y: 0.1, z: 0.0 }));
    const returnResult = smoother.smooth(newLandmarks, 1.032);
    expect(returnResult[8].x).toBe(0.9); // Immediate snap, no stale interpolation
  });
});
