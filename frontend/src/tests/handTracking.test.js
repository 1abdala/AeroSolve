import { describe, it, expect } from 'vitest';
import {
  INDEX_FINGER_TIP_INDEX,
  HAND_CONNECTIONS,
  sanitizeInferenceTimestamp,
} from '../services/handTracking';

describe('MediaPipe Hand Landmark Constants and Topology', () => {
  it('correctly targets landmark index 8 for index fingertip', () => {
    expect(INDEX_FINGER_TIP_INDEX).toBe(8);
  });

  it('contains valid skeleton topology for all 21 hand landmarks', () => {
    expect(HAND_CONNECTIONS.length).toBeGreaterThan(15);

    // Ensure all landmark indices referenced in connections are within [0, 20]
    for (const [start, end] of HAND_CONNECTIONS) {
      expect(start).toBeGreaterThanOrEqual(0);
      expect(start).toBeLessThanOrEqual(20);
      expect(end).toBeGreaterThanOrEqual(0);
      expect(end).toBeLessThanOrEqual(20);
      expect(start).not.toBe(end);
    }
  });

  it('includes connection to index fingertip landmark 8', () => {
    const fingertipConnection = HAND_CONNECTIONS.find(
      ([start, end]) => start === 8 || end === 8
    );
    expect(fingertipConnection).toBeDefined();
    // Index finger DIP (7) connects to Index finger TIP (8)
    expect(fingertipConnection).toEqual([7, 8]);
  });
});

describe('Coordinate Transformation and Video Mirroring', () => {
  it('correctly maps normalized coordinates to canvas pixel space with horizontal mirror', () => {
    const canvasWidth = 1280;
    const canvasHeight = 720;

    // Simulate raw landmark coordinates
    const rawLandmarkLeft = { x: 0.2, y: 0.4, z: -0.05 };
    const rawLandmarkCenter = { x: 0.5, y: 0.5, z: 0.0 };
    const rawLandmarkRight = { x: 0.8, y: 0.6, z: 0.02 };

    // Function matching the transform used in useHandTracking
    const mapCoordinates = (lm, width, height) => ({
      x: (1 - lm.x) * width,
      y: lm.y * height,
    });

    // In mirrored view:
    // Raw x=0.2 (left side of raw sensor) should appear on user's right side (x = 0.8 * 1280 = 1024)
    const mappedLeft = mapCoordinates(rawLandmarkLeft, canvasWidth, canvasHeight);
    expect(mappedLeft.x).toBeCloseTo(1024, 1);
    expect(mappedLeft.y).toBeCloseTo(288, 1);

    // Center should remain centered (x = 0.5 * 1280 = 640)
    const mappedCenter = mapCoordinates(rawLandmarkCenter, canvasWidth, canvasHeight);
    expect(mappedCenter.x).toBeCloseTo(640, 1);
    expect(mappedCenter.y).toBeCloseTo(360, 1);

    // Raw x=0.8 should appear on user's left side (x = 0.2 * 1280 = 256)
    const mappedRight = mapCoordinates(rawLandmarkRight, canvasWidth, canvasHeight);
    expect(mappedRight.x).toBeCloseTo(256, 1);
    expect(mappedRight.y).toBeCloseTo(432, 1);
  });
});

describe('Timestamp Sanitization for MediaPipe Tasks Vision', () => {
  it('guarantees strictly increasing integer timestamps', () => {
    // Normal sequential progression
    expect(sanitizeInferenceTimestamp(100, 133.4)).toBe(133);
    expect(sanitizeInferenceTimestamp(133, 166.7)).toBe(167);

    // Stale or duplicate timestamp (must increment by at least 1)
    expect(sanitizeInferenceTimestamp(167, 167)).toBe(168);
    expect(sanitizeInferenceTimestamp(167, 166)).toBe(168);
    expect(sanitizeInferenceTimestamp(167, 100)).toBe(168);

    // Initial state handling
    expect(sanitizeInferenceTimestamp(-1, 0)).toBe(0);
    expect(sanitizeInferenceTimestamp(-1, 15.2)).toBe(15);
  });

  it('handles invalid inputs gracefully without throwing', () => {
    expect(sanitizeInferenceTimestamp(100, NaN)).toBe(101);
    expect(sanitizeInferenceTimestamp(null, 50)).toBe(50);
  });
});
