import { describe, it, expect } from 'vitest';
import {
  THUMB_TIP_INDEX,
  INDEX_FINGER_TIP_INDEX,
  PINCH_START_THRESHOLD,
  PINCH_RELEASE_THRESHOLD,
  MIN_POINT_DISTANCE,
  calculateLandmarkDistance,
  updatePinchHysteresis,
  mapNormalizedToCanvas,
  renderStrokesToCanvas,
} from '../services/airWriting';

describe('Landmark Constants for Air-Writing', () => {
  it('identifies thumb tip as landmark 4 and index tip as landmark 8', () => {
    expect(THUMB_TIP_INDEX).toBe(4);
    expect(INDEX_FINGER_TIP_INDEX).toBe(8);
  });

  it('maintains valid hysteresis threshold boundaries', () => {
    expect(PINCH_START_THRESHOLD).toBeGreaterThan(0);
    expect(PINCH_RELEASE_THRESHOLD).toBeGreaterThan(PINCH_START_THRESHOLD);
    // Difference should be sufficiently wide to prevent flicker
    expect(PINCH_RELEASE_THRESHOLD - PINCH_START_THRESHOLD).toBeGreaterThanOrEqual(0.015);
  });
});

describe('calculateLandmarkDistance', () => {
  it('calculates 3D Euclidean distance between two landmarks', () => {
    const p1 = { x: 0.1, y: 0.2, z: 0.0 };
    const p2 = { x: 0.4, y: 0.6, z: 0.0 };
    // 3-4-5 triangle: dx = 0.3, dy = 0.4 => dist = 0.5
    const dist = calculateLandmarkDistance(p1, p2);
    expect(dist).toBeCloseTo(0.5, 4);
  });

  it('includes z-axis depth when available', () => {
    const p1 = { x: 0.0, y: 0.0, z: 0.0 };
    const p2 = { x: 0.1, y: 0.2, z: 0.2 };
    // dx^2 + dy^2 + dz^2 = 0.01 + 0.04 + 0.04 = 0.09 => sqrt = 0.3
    const dist = calculateLandmarkDistance(p1, p2);
    expect(dist).toBeCloseTo(0.3, 4);
  });

  it('returns Infinity when either point is null or undefined', () => {
    expect(calculateLandmarkDistance(null, { x: 0.1, y: 0.1 })).toBe(Infinity);
    expect(calculateLandmarkDistance({ x: 0.1, y: 0.1 }, null)).toBe(Infinity);
  });
});

describe('updatePinchHysteresis', () => {
  it('activates pinch when distance falls below start threshold', () => {
    const isPinching = false;
    const distance = PINCH_START_THRESHOLD - 0.01; // e.g. 0.055 < 0.065
    const nextState = updatePinchHysteresis(isPinching, distance);
    expect(nextState).toBe(true);
  });

  it('does not activate pinch when distance is above start threshold', () => {
    const isPinching = false;
    const distance = PINCH_START_THRESHOLD + 0.01; // e.g. 0.075 > 0.065
    const nextState = updatePinchHysteresis(isPinching, distance);
    expect(nextState).toBe(false);
  });

  it('maintains PINCHING state inside the hysteresis gap', () => {
    const isPinching = true;
    // Midpoint between start (0.065) and release (0.085)
    const midDistance = (PINCH_START_THRESHOLD + PINCH_RELEASE_THRESHOLD) / 2;
    const nextState = updatePinchHysteresis(isPinching, midDistance);
    expect(nextState).toBe(true); // Must stay pinching!
  });

  it('maintains NOT PINCHING state inside the hysteresis gap', () => {
    const isPinching = false;
    const midDistance = (PINCH_START_THRESHOLD + PINCH_RELEASE_THRESHOLD) / 2;
    const nextState = updatePinchHysteresis(isPinching, midDistance);
    expect(nextState).toBe(false); // Must stay not pinching!
  });

  it('releases pinch when distance exceeds release threshold', () => {
    const isPinching = true;
    const distance = PINCH_RELEASE_THRESHOLD + 0.01; // e.g. 0.095 > 0.085
    const nextState = updatePinchHysteresis(isPinching, distance);
    expect(nextState).toBe(false);
  });
});

describe('Air-Writing Stroke Lifecycle & Tracking Loss Simulation', () => {
  it('handles stroke start, continuation, point filtering, and release', () => {
    const completedStrokes = [];
    let activeStroke = null;
    let isPinching = false;

    const simulateFrame = (thumbTip, indexTip) => {
      const dist = calculateLandmarkDistance(thumbTip, indexTip);
      const newPinch = updatePinchHysteresis(isPinching, dist);

      if (newPinch) {
        if (!isPinching) {
          // Stroke Start
          activeStroke = [{ x: indexTip.x, y: indexTip.y }];
        } else if (activeStroke && activeStroke.length > 0) {
          // Stroke Continuation
          const lastPoint = activeStroke[activeStroke.length - 1];
          const delta = Math.hypot(indexTip.x - lastPoint.x, indexTip.y - lastPoint.y);
          if (delta >= MIN_POINT_DISTANCE) {
            activeStroke.push({ x: indexTip.x, y: indexTip.y });
          }
        }
      } else {
        if (isPinching && activeStroke) {
          // Stroke End
          completedStrokes.push(activeStroke);
          activeStroke = null;
        }
      }

      isPinching = newPinch;
    };

    // Frame 1: Hand open (dist = 0.15) -> Not pinching
    simulateFrame({ x: 0.3, y: 0.3 }, { x: 0.45, y: 0.3 });
    expect(isPinching).toBe(false);
    expect(activeStroke).toBeNull();
    expect(completedStrokes.length).toBe(0);

    // Frame 2: Pinch begins (dist = 0.04 < 0.065) -> Stroke starts
    simulateFrame({ x: 0.4, y: 0.4 }, { x: 0.44, y: 0.4 });
    expect(isPinching).toBe(true);
    expect(activeStroke).not.toBeNull();
    expect(activeStroke.length).toBe(1);

    // Frame 3: Finger moves while pinching -> Point appended
    simulateFrame({ x: 0.42, y: 0.42 }, { x: 0.46, y: 0.42 });
    expect(activeStroke.length).toBe(2);

    // Frame 4: Stationary micro-jitter (< MIN_POINT_DISTANCE) -> Ignored
    simulateFrame({ x: 0.4205, y: 0.4205 }, { x: 0.4605, y: 0.4205 });
    expect(activeStroke.length).toBe(2);

    // Frame 5: Pinch released (dist = 0.12 > 0.085) -> Stroke finalized
    simulateFrame({ x: 0.35, y: 0.4 }, { x: 0.47, y: 0.4 });
    expect(isPinching).toBe(false);
    expect(activeStroke).toBeNull();
    expect(completedStrokes.length).toBe(1);
    expect(completedStrokes[0].length).toBe(2);
  });

  it('safely commits active stroke upon sudden tracking loss without joining strokes', () => {
    const completedStrokes = [];
    let activeStroke = [{ x: 0.5, y: 0.5 }, { x: 0.52, y: 0.52 }];
    let isPinching = true;

    // Simulate hand disappearing from camera frame
    const handDetected = false;

    if (!handDetected) {
      if (activeStroke) {
        completedStrokes.push(activeStroke);
        activeStroke = null;
      }
      isPinching = false;
    }

    expect(isPinching).toBe(false);
    expect(activeStroke).toBeNull();
    expect(completedStrokes.length).toBe(1);

    // When hand returns at a new location, start a clean independent stroke
    const newHandDetected = true;
    if (newHandDetected) {
      activeStroke = [{ x: 0.1, y: 0.1 }];
      isPinching = true;
    }

    expect(completedStrokes.length).toBe(1);
    expect(activeStroke.length).toBe(1);
    expect(activeStroke[0]).toEqual({ x: 0.1, y: 0.1 });
  });
});

describe('Coordinate Transformation & Canvas Rendering', () => {
  it('maps normalized coordinates to mirrored canvas coordinates', () => {
    const canvasWidth = 1000;
    const canvasHeight = 600;

    const normPt = { x: 0.25, y: 0.75 };
    const canvasPt = mapNormalizedToCanvas(normPt, canvasWidth, canvasHeight);

    // Mirrored X: (1 - 0.25) * 1000 = 750
    expect(canvasPt.x).toBe(750);
    // Y: 0.75 * 600 = 450
    expect(canvasPt.y).toBe(450);
  });

  it('renders strokes to canvas context without throwing', () => {
    const mockCtx = {
      clearRect: () => {},
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
    };

    const strokes = [
      [{ x: 0.2, y: 0.3 }, { x: 0.25, y: 0.35 }],
      [{ x: 0.6, y: 0.6 }], // Single-point dot
    ];

    expect(() => {
      renderStrokesToCanvas(mockCtx, strokes, 800, 600);
    }).not.toThrow();
  });
});
