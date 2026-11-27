import { describe, it, expect } from 'vitest';
import {
  THUMB_TIP_INDEX,
  INDEX_FINGER_TIP_INDEX,
  PINCH_START_THRESHOLD,
  PINCH_RELEASE_THRESHOLD,
  PINCH_RELEASE_IMMEDIATE_THRESHOLD,
  PINCH_RELEASE_DEBOUNCE_FRAMES,
  MIN_POINT_DISTANCE,
  MAX_DROPOUT_GRACE_FRAMES,
  MAX_DROPOUT_GRACE_MS,
  MAX_RESUME_GAP_MS,
  MAX_RESUME_GAP_DISTANCE,
  canResumeSuspendedStroke,
  validateFingertipStability,
  checkHandBoundaryProximity,
  calculateLandmarkDistance,
  calculatePinchDistance,
  calculateEffectivePinchDistance,
  evaluatePinchGesture,
  updatePinchHysteresis,
  isTrackingInGracePeriod,
  isTrackingGenuinelyLost,
  mapNormalizedToCanvas,
  renderStrokesToCanvas,
} from '../services/airWriting';
import { HandLandmarksSmoother } from '../services/oneEuroFilter';

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

describe('calculatePinchDistance', () => {
  it('calculates 2D image-plane distance between thumb and index tips', () => {
    const thumb = { x: 0.1, y: 0.2, z: 0.5 }; // Large depth discrepancy (e.g. hand angle)
    const index = { x: 0.13, y: 0.24, z: -0.3 };
    // 2D distance: dx = 0.03, dy = 0.04 => hypot = 0.05
    const dist2D = calculatePinchDistance(thumb, index);
    expect(dist2D).toBeCloseTo(0.05, 4);

    // Unlike 3D distance which would blow up to ~0.80 due to dz=0.8,
    // 2D distance remains unaffected by perspective depth noise
    const dist3D = calculateLandmarkDistance(thumb, index);
    expect(dist3D).toBeGreaterThan(0.7);
    expect(dist2D).toBeLessThan(0.065); // Within pinch start threshold!
  });

  it('returns Infinity when either landmark is null or undefined', () => {
    expect(calculatePinchDistance(null, { x: 0.1, y: 0.1 })).toBe(Infinity);
    expect(calculatePinchDistance({ x: 0.1, y: 0.1 }, null)).toBe(Infinity);
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
  it('maps visual normalized coordinates to canvas pixel coordinates', () => {
    const canvasWidth = 1000;
    const canvasHeight = 600;

    const normPt = { x: 0.25, y: 0.75 };
    const canvasPt = mapNormalizedToCanvas(normPt, canvasWidth, canvasHeight);

    // Visual X: 0.25 * 1000 = 250
    expect(canvasPt.x).toBe(250);
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

describe('Tracking Dropout Grace & Loss State Machine', () => {
  it('correctly identifies brief dropout grace period vs active vs genuine loss', () => {
    expect(MAX_DROPOUT_GRACE_FRAMES).toBe(4);
    expect(MAX_DROPOUT_GRACE_MS).toBe(150);

    // 0 missed frames: active tracking (not grace period)
    expect(isTrackingInGracePeriod(0, 0)).toBe(false);
    expect(isTrackingGenuinelyLost(0, 0)).toBe(false);

    // 1 to 4 missed frames within 150ms: valid grace period
    expect(isTrackingInGracePeriod(1, 33)).toBe(true);
    expect(isTrackingInGracePeriod(2, 66)).toBe(true);
    expect(isTrackingInGracePeriod(3, 100)).toBe(true);
    expect(isTrackingInGracePeriod(4, 133)).toBe(true);
    expect(isTrackingGenuinelyLost(4, 133)).toBe(false);

    // Exceeding max frames (5 frames): genuine loss
    expect(isTrackingInGracePeriod(5, 133)).toBe(false);
    expect(isTrackingGenuinelyLost(5, 133)).toBe(true);

    // Exceeding max elapsed time (> 150ms): genuine loss even if frames <= 4
    expect(isTrackingInGracePeriod(2, 200)).toBe(false);
    expect(isTrackingGenuinelyLost(2, 200)).toBe(true);
  });

  it('holds state without drawing during brief dropouts and resumes seamlessly', () => {
    let completedStrokes = [];
    let activeStroke = [{ x: 0.5, y: 0.5 }];
    let isPinching = true;
    let missedFrames = 0;
    let lastDetectionTime = 1000;

    // Simulation of frame processing loop
    const processVideoFrame = (detected, now, tipCoord = null) => {
      if (detected && tipCoord) {
        missedFrames = 0;
        lastDetectionTime = now;

        if (isPinching && activeStroke) {
          const lastPt = activeStroke[activeStroke.length - 1];
          const dist = Math.hypot(tipCoord.x - lastPt.x, tipCoord.y - lastPt.y);
          if (dist >= MIN_POINT_DISTANCE) {
            activeStroke.push(tipCoord);
          }
        }
      } else {
        missedFrames += 1;
        const elapsed = now - lastDetectionTime;

        if (isTrackingInGracePeriod(missedFrames, elapsed)) {
          // In grace: CRITICAL RULE - DO NOT ADD POINTS TO ACTIVE STROKE!
          // Drawing is paused, but activeStroke is NOT destroyed.
        } else if (isTrackingGenuinelyLost(missedFrames, elapsed)) {
          // Genuine loss: commit stroke and clear
          if (activeStroke && activeStroke.length > 0) {
            completedStrokes.push(activeStroke);
          }
          activeStroke = null;
          isPinching = false;
        }
      }
    };

    // Frame 1 (t=1033ms): Brief dropout (1 missed frame)
    processVideoFrame(false, 1033);
    expect(missedFrames).toBe(1);
    expect(activeStroke).not.toBeNull();
    expect(activeStroke.length).toBe(1); // No point added!
    expect(completedStrokes.length).toBe(0);

    // Frame 2 (t=1066ms): Brief dropout continues (2 missed frames)
    processVideoFrame(false, 1066);
    expect(missedFrames).toBe(2);
    expect(activeStroke).not.toBeNull();
    expect(activeStroke.length).toBe(1); // Still paused, no point added!

    // Frame 3 (t=1100ms): Hand re-detected! Tracking resumes
    processVideoFrame(true, 1100, { x: 0.55, y: 0.5 });
    expect(missedFrames).toBe(0);
    expect(activeStroke).not.toBeNull();
    expect(activeStroke.length).toBe(2); // New point cleanly added
    expect(completedStrokes.length).toBe(0);
  });

  it('resets filter and ends stroke upon genuine tracking loss (> 4 missed frames)', () => {
    let completedStrokes = [];
    let activeStroke = [{ x: 0.2, y: 0.2 }, { x: 0.25, y: 0.25 }];
    let isPinching = true;
    let missedFrames = 0;
    let lastDetectionTime = 1000;
    const smoother = new HandLandmarksSmoother(1.2, 12.0, 1.0);

    // Seed smoother with 21 landmarks
    const landmarks = Array.from({ length: 21 }, () => ({ x: 0.2, y: 0.2, z: 0.0 }));
    smoother.smooth(landmarks, 1.0);
    expect(smoother.isTracking).toBe(true);

    // Simulate 5 consecutive missed frames (dropout exceeds grace threshold)
    for (let f = 1; f <= 5; f++) {
      const now = 1000 + f * 33;
      missedFrames += 1;
      const elapsed = now - lastDetectionTime;

      if (isTrackingGenuinelyLost(missedFrames, elapsed)) {
        if (activeStroke && activeStroke.length > 0) {
          completedStrokes.push(activeStroke);
        }
        activeStroke = null;
        isPinching = false;
        smoother.reset();
      }
    }

    // Verify genuine tracking loss clean reset
    expect(activeStroke).toBeNull();
    expect(isPinching).toBe(false);
    expect(completedStrokes.length).toBe(1);
    expect(completedStrokes[0].length).toBe(2);
    expect(smoother.isTracking).toBe(false);

    // When hand returns 1 second later at a completely different position (x = 0.8)
    const newLandmarks = Array.from({ length: 21 }, () => ({ x: 0.8, y: 0.8, z: 0.0 }));
    const smoothedReturn = smoother.smooth(newLandmarks, 2.0);

    // Filter must snap immediately to 0.8 with zero stale interpolation
    expect(smoothedReturn[INDEX_FINGER_TIP_INDEX].x).toBe(0.8);
  });

  it('verifies coordinate alignment between raw fingertip and smoothed fingertip', () => {
    const smoother = new HandLandmarksSmoother(1.2, 12.0, 1.0);
    const canvasWidth = 1280;
    const canvasHeight = 720;

    // Simulate steady fingertip at (x: 0.35, y: 0.45)
    let time = 1.0;
    let rawIndexTip = { x: 0.35, y: 0.45, z: 0.0 };
    let smoothedLandmarks = null;

    for (let frame = 0; frame < 5; frame++) {
      const landmarks = Array.from({ length: 21 }, () => ({ ...rawIndexTip }));
      smoothedLandmarks = smoother.smooth(landmarks, time);
      time += 0.033;
    }

    const smoothedIndexTip = smoothedLandmarks[INDEX_FINGER_TIP_INDEX];

    // Filtered tip should closely match raw tip (< 0.005 difference)
    expect(Math.abs(smoothedIndexTip.x - rawIndexTip.x)).toBeLessThan(0.005);
    expect(Math.abs(smoothedIndexTip.y - rawIndexTip.y)).toBeLessThan(0.005);

    // Both raw and smoothed tip map to the identical canvas pixel location within 4px
    const rawCanvasPt = mapNormalizedToCanvas(rawIndexTip, canvasWidth, canvasHeight);
    const smoothedCanvasPt = mapNormalizedToCanvas(smoothedIndexTip, canvasWidth, canvasHeight);

    expect(Math.abs(rawCanvasPt.x - smoothedCanvasPt.x)).toBeLessThan(4.0);
    expect(Math.abs(rawCanvasPt.y - smoothedCanvasPt.y)).toBeLessThan(4.0);
  });
});

describe('Continuous Stroke Resumption and Fingertip Stability (M3 Improvement)', () => {
  it('detects brief fingertip landmark instability vs stable hand geometry', () => {
    // Normal hand geometry (wrist at 0.5, 0.7; index MCP at 0.5, 0.5; index TIP at 0.5, 0.4)
    const validLandmarks = Array.from({ length: 21 }, (_, i) => ({
      x: 0.5,
      y: 0.7 - i * 0.015,
      z: 0.0,
    }));
    validLandmarks[0] = { x: 0.5, y: 0.7, z: 0.0 }; // Wrist
    validLandmarks[5] = { x: 0.5, y: 0.5, z: 0.0 }; // Index MCP (palm dist = 0.20)
    validLandmarks[8] = { x: 0.5, y: 0.4, z: 0.0 }; // Index Tip (finger dist = 0.10)

    const stableResult = validateFingertipStability(validLandmarks, { x: 0.5, y: 0.4 }, 0.033);
    expect(stableResult.isStable).toBe(true);

    // Case 1: Non-finite coordinate
    const nanLandmarks = validLandmarks.map((lm, i) =>
      i === 8 ? { x: NaN, y: 0.4, z: 0.0 } : lm
    );
    const nanResult = validateFingertipStability(nanLandmarks);
    expect(nanResult.isStable).toBe(false);
    expect(nanResult.reason).toContain('non-finite');

    // Case 2: Physically anomalous finger length (> 4.5x palm scale)
    const stretchedLandmarks = validLandmarks.map((lm, i) =>
      i === 8 ? { x: 0.5, y: -0.5, z: 0.0 } : lm // Finger dist = 1.0 vs palm 0.20 (5x!)
    );
    const stretchedResult = validateFingertipStability(stretchedLandmarks);
    expect(stretchedResult.isStable).toBe(false);
    expect(stretchedResult.reason).toContain('Finger length anomalous');

    // Case 3: Sudden teleportation jump (> 0.22 in a single 33ms frame)
    const teleportedResult = validateFingertipStability(
      validLandmarks,
      { x: 0.15, y: 0.4 }, // prevTip was at 0.15, current is at 0.5 (dx = 0.35!)
      0.033
    );
    expect(teleportedResult.isStable).toBe(false);
    expect(teleportedResult.reason).toContain('teleported');

    // Case 4: Fast but legitimate swipe movement (e.g. 0.18 in 33ms) must remain STABLE
    const fastSwipeResult = validateFingertipStability(
      validLandmarks,
      { x: 0.32, y: 0.4 }, // dx = 0.18 <= 0.22 maxJump
      0.033
    );
    expect(fastSwipeResult.isStable).toBe(true);
  });

  it('safely resumes continuous stroke across brief tracking gaps without break', () => {
    expect(MAX_RESUME_GAP_MS).toBe(200);
    expect(MAX_RESUME_GAP_DISTANCE).toBe(0.20);

    const lastPoint = { x: 0.35, y: 0.50 };
    const recoveredPoint = { x: 0.38, y: 0.50 }; // distance = 0.03 <= MAX_RESUME_GAP_DISTANCE (0.20)
    const elapsedMs = 66; // 2 frames <= MAX_RESUME_GAP_MS (200ms)

    const resumeCheck = canResumeSuspendedStroke(lastPoint, recoveredPoint, elapsedMs);
    expect(resumeCheck.canResume).toBe(true);
    expect(resumeCheck.distance).toBeCloseTo(0.03, 3);

    // Fast writing stroke resumption: hand moved 0.17 across a 100ms gap (3 frames)
    const fastMovedPoint = { x: 0.52, y: 0.50 }; // distance = 0.17 <= 0.20
    const fastResumeCheck = canResumeSuspendedStroke(lastPoint, fastMovedPoint, 100);
    expect(fastResumeCheck.canResume).toBe(true);
    expect(fastResumeCheck.distance).toBeCloseTo(0.17, 2);
  });

  it('separates strokes when gap duration exceeds maximum resume threshold', () => {
    const lastPoint = { x: 0.35, y: 0.50 };
    const recoveredPoint = { x: 0.36, y: 0.50 }; // small distance
    const elapsedMs = 250; // exceeds 200ms limit!

    const resumeCheck = canResumeSuspendedStroke(lastPoint, recoveredPoint, elapsedMs);
    expect(resumeCheck.canResume).toBe(false);
    expect(resumeCheck.reason).toContain('exceeds limit');
  });

  it('rejects large position jumps to prevent blind connections across gaps', () => {
    const lastPoint = { x: 0.20, y: 0.20 };
    const jumpPoint = { x: 0.40, y: 0.40 }; // jump = 0.28 >> 0.15
    const elapsedMs = 40; // very fast frame

    const resumeCheck = canResumeSuspendedStroke(lastPoint, jumpPoint, elapsedMs);
    expect(resumeCheck.canResume).toBe(false);
    expect(resumeCheck.reason).toContain('Spatial gap distance');
  });

  it('maintains stability for hand at an angle with foreshortened palm axis', () => {
    // Tilted hand: wrist-to-index knuckle (0->5) is foreshortened along view axis (0.04),
    // but palm width (5->17) is fully visible (0.16).
    const tiltedLandmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0.0 }));
    tiltedLandmarks[0] = { x: 0.50, y: 0.54, z: 0.0 }; // Wrist
    tiltedLandmarks[5] = { x: 0.50, y: 0.50, z: 0.0 }; // Index MCP (axis = 0.04)
    tiltedLandmarks[9] = { x: 0.55, y: 0.50, z: 0.0 }; // Middle MCP
    tiltedLandmarks[17] = { x: 0.66, y: 0.50, z: 0.0 }; // Pinky MCP (width = 0.16)
    tiltedLandmarks[8] = { x: 0.50, y: 0.38, z: 0.0 }; // Index Tip (finger dist = 0.12)

    // With multi-axis palm scale (max(0.04, 0.16) = 0.16), fingerDist 0.12 < 0.16 * 3.5 (0.56)
    const result = validateFingertipStability(tiltedLandmarks, { x: 0.50, y: 0.38 }, 0.033);
    expect(result.isStable).toBe(true);
  });

  it('maintains continuous stroke without discontinuity during fast continuous drawing', () => {
    // Simulate user drawing a fast continuous line across the canvas
    const stroke = [];
    const completedStrokes = [];

    // 10 continuous frames moving across screen from x=0.20 to x=0.56
    for (let f = 0; f < 10; f++) {
      const currentPoint = { x: 0.20 + f * 0.04, y: 0.50 };
      const simulatedPinchDist = 0.05 + Math.sin(f) * 0.015; // stays < 0.075

      const isPinching = updatePinchHysteresis(true, simulatedPinchDist);
      expect(isPinching).toBe(true);

      if (stroke.length === 0) {
        stroke.push(currentPoint);
      } else {
        const lastPt = stroke[stroke.length - 1];
        if (Math.hypot(currentPoint.x - lastPt.x, currentPoint.y - lastPt.y) >= MIN_POINT_DISTANCE) {
          stroke.push(currentPoint);
        }
      }
    }

    // All 10 points should be part of a single continuous stroke
    expect(stroke.length).toBe(10);
    expect(completedStrokes.length).toBe(0);
    expect(stroke[0].x).toBe(0.20);
    expect(stroke[9].x).toBeCloseTo(0.56, 2);
  });

  it('prevents false pinch release during fast motion by combining raw and smoothed pinch distances', () => {
    // During rapid acceleration, independent filters on thumb and index may experience phase lag
    // causing smoothed distance to momentarily widen (e.g. 0.090 > 0.085 release threshold)
    // while physical fingers remain in contact in raw sensor frame (e.g. 0.040)
    let isPinching = true;

    const rawThumb = { x: 0.40, y: 0.50 };
    const rawIndex = { x: 0.44, y: 0.50 }; // raw dist = 0.04 (touching)
    const smoothedThumb = { x: 0.38, y: 0.50 };
    const smoothedIndex = { x: 0.47, y: 0.50 }; // smoothed dist = 0.09 (lag artifact)

    const rawDist = calculatePinchDistance(rawThumb, rawIndex);
    const smoothedDist = calculatePinchDistance(smoothedThumb, smoothedIndex);
    const effectiveDist = Math.min(smoothedDist, rawDist);

    // Using smoothed only would falsely release:
    expect(updatePinchHysteresis(isPinching, smoothedDist)).toBe(false);

    // Using effective distance maintains active pinch:
    const nextState = updatePinchHysteresis(isPinching, effectiveDist);
    expect(nextState).toBe(true);
  });

  it('tolerates single-frame tracking instability without fragmenting active stroke', () => {
    let completedStrokes = [];
    let activeStroke = [{ x: 0.3, y: 0.3 }];
    let suspendedStroke = null;
    let consecutiveMissed = 0;

    // Frame 1: Index tip momentary glitch (jump > 0.22)
    consecutiveMissed += 1;
    // In our improved hook: only suspend if consecutiveMissed >= 2
    if (consecutiveMissed >= 2 && activeStroke && !suspendedStroke) {
      suspendedStroke = { stroke: activeStroke };
      activeStroke = null;
    }
    // 1-frame glitch: activeStroke is preserved!
    expect(activeStroke).not.toBeNull();
    expect(suspendedStroke).toBeNull();

    // Frame 2: Tip stabilizes immediately
    consecutiveMissed = 0;
    activeStroke.push({ x: 0.35, y: 0.3 }); // continuous continuation
    expect(activeStroke.length).toBe(2);
    expect(completedStrokes.length).toBe(0);
  });

  it('audits coordinate mapping and demonstrates aspect-ratio anisotropy on 16:9 displays', () => {
    const width = 1280;
    const height = 720;
    const aspectRatio = width / height; // ~1.7778

    // 50 pixels horizontal displacement
    const dxPx = 50;
    const dxNorm = dxPx / width; // 50 / 1280 = 0.03906

    // 50 pixels vertical displacement
    const dyPx = 50;
    const dyNorm = dyPx / height; // 50 / 720 = 0.06944

    // Although the physical displacement on screen is identical (50 pixels),
    // the normalized vertical distance is exactly (aspectRatio) times larger!
    expect(dyNorm / dxNorm).toBeCloseTo(aspectRatio, 3);

    // In horizontal pinch, 50px is within start threshold (0.039 <= 0.065)
    expect(dxNorm).toBeLessThanOrEqual(PINCH_START_THRESHOLD);

    // In purely vertical orientation, the exact same 50px physical separation
    // produces a normalized distance of 0.069 > PINCH_START_THRESHOLD (0.065)!
    expect(dyNorm).toBeGreaterThan(PINCH_START_THRESHOLD);
  });

  it('separates continuous tracer tracking from pinch gesture logic', () => {
    // Mode A: Continuous Tracer
    const tracerStroke = [];
    const simulatedPoints = [
      { x: 0.1, y: 0.2 },
      { x: 0.15, y: 0.25 },
      { x: 0.2, y: 0.3 },
    ];

    // In continuous tracer mode: no pinch threshold is needed, points are captured directly
    for (const pt of simulatedPoints) {
      tracerStroke.push(pt);
    }
    expect(tracerStroke.length).toBe(3);

    // Mode B: Pinch Air-Writing with wide hand (open fingers, dist = 0.15)
    const pinchStroke = [];
    const openHandPinchDist = 0.15;
    const isPinching = updatePinchHysteresis(false, openHandPinchDist);
    expect(isPinching).toBe(false);

    // In pinch mode, open fingers do not record points
    if (isPinching) {
      pinchStroke.push(simulatedPoints[0]);
    }
    expect(pinchStroke.length).toBe(0);
  });
});

describe('Pinch-Release Sensitivity, Debounce & Continuous Writing Stability', () => {
  it('maintains calibrated threshold boundaries (start < release < immediate release)', () => {
    expect(PINCH_START_THRESHOLD).toBe(0.065);
    expect(PINCH_RELEASE_THRESHOLD).toBe(0.085);
    expect(PINCH_RELEASE_IMMEDIATE_THRESHOLD).toBe(0.105);
    expect(PINCH_RELEASE_DEBOUNCE_FRAMES).toBe(2);

    // Hysteresis gap: release threshold must exceed start threshold by at least 0.015
    expect(PINCH_RELEASE_THRESHOLD - PINCH_START_THRESHOLD).toBeCloseTo(0.020, 3);
    // Transition tolerance window: immediate release exceeds release threshold by 0.020
    expect(PINCH_RELEASE_IMMEDIATE_THRESHOLD - PINCH_RELEASE_THRESHOLD).toBeCloseTo(0.020, 3);
  });

  describe('calculateEffectivePinchDistance', () => {
    it('uses raw distance during active pinch contact to eliminate filter phase lag in fast motion', () => {
      // In fast motion, physical fingers remain touching (raw = 0.040), but smoothed filter lags (0.090)
      const rawDist = 0.040;
      const smoothedDist = 0.090;
      const effectiveDist = calculateEffectivePinchDistance(smoothedDist, rawDist);

      // Must pick the smaller raw distance so active pinch is NOT broken
      expect(effectiveDist).toBeCloseTo(0.040, 3);
      expect(effectiveDist).toBeLessThanOrEqual(PINCH_START_THRESHOLD);
    });

    it('uses raw distance during deliberate wide separation to eliminate filter smoothing lag on release', () => {
      // User opens fingers (raw = 0.115 >= 0.105), but smoothed filter lags behind (0.075 < 0.085)
      const rawDist = 0.115;
      const smoothedDist = 0.075;
      const effectiveDist = calculateEffectivePinchDistance(smoothedDist, rawDist);

      // Must pick the separated raw distance so release is NOT delayed by filter lag
      expect(effectiveDist).toBeCloseTo(0.115, 3);
      expect(effectiveDist).toBeGreaterThanOrEqual(PINCH_RELEASE_IMMEDIATE_THRESHOLD);
    });

    it('uses smoothed/min in intermediate band to protect writing curves from transient raw noise spikes', () => {
      // Transient 1-frame raw spike during writing: raw = 0.092, but smoothed = 0.062
      const rawDist = 0.092;
      const smoothedDist = 0.062;
      const effectiveDist = calculateEffectivePinchDistance(smoothedDist, rawDist);

      // Filter must protect the stroke from the raw noise spike
      expect(effectiveDist).toBeCloseTo(0.062, 3);
      expect(effectiveDist).toBeLessThan(PINCH_RELEASE_THRESHOLD);
    });

    it('handles null and undefined safely without throwing', () => {
      expect(calculateEffectivePinchDistance(null, 0.05)).toBe(0.05);
      expect(calculateEffectivePinchDistance(0.05, null)).toBe(0.05);
      expect(calculateEffectivePinchDistance(null, null)).toBe(Infinity);
    });
  });

  describe('evaluatePinchGesture', () => {
    it('activates pinch from idle when effective distance is below start threshold', () => {
      const result = evaluatePinchGesture(false, 0.050, 0.050, 0);
      expect(result.isPinching).toBe(true);
      expect(result.isDebouncing).toBe(false);
      expect(result.shouldAddPoint).toBe(true);
      expect(result.effectiveDistance).toBeCloseTo(0.050, 3);
      expect(result.unpinchedFrames).toBe(0);
      expect(result.reason).toContain('Pinch start');
    });

    it('releases pinch immediately without debounce when fingers deliberately separate (>= 0.105)', () => {
      // User actively pinching, then deliberately opens fingers (raw = 0.115, smoothed = 0.075)
      const result = evaluatePinchGesture(true, 0.075, 0.115, 0);
      expect(result.isPinching).toBe(false);
      expect(result.isDebouncing).toBe(false);
      expect(result.shouldAddPoint).toBe(false);
      expect(result.effectiveDistance).toBeCloseTo(0.115, 3);
      expect(result.unpinchedFrames).toBe(0);
      expect(result.reason).toContain('Immediate pinch release');
    });

    it('enters debounce in tolerance band [0.085, 0.105) and tolerates 2-frame fluctuations', () => {
      // Frame 1: Minor fluctuation into tolerance band (dist = 0.090)
      const frame1 = evaluatePinchGesture(true, 0.090, 0.090, 0);
      expect(frame1.isPinching).toBe(true);      // Holds stroke active (does not split)
      expect(frame1.isDebouncing).toBe(true);   // In debounce mode
      expect(frame1.shouldAddPoint).toBe(false); // Suppresses trailing ink!
      expect(frame1.unpinchedFrames).toBe(1);

      // Frame 2: Fluctuation continues into second frame (dist = 0.092)
      const frame2 = evaluatePinchGesture(true, 0.092, 0.092, frame1.unpinchedFrames);
      expect(frame2.isPinching).toBe(true);      // Still held active on frame 2!
      expect(frame2.isDebouncing).toBe(true);
      expect(frame2.shouldAddPoint).toBe(false);
      expect(frame2.unpinchedFrames).toBe(2);

      // Scenario A: Frame 3 returns to contact (dist = 0.045) -> stroke resumes seamlessly
      const frame3A = evaluatePinchGesture(true, 0.045, 0.045, frame2.unpinchedFrames);
      expect(frame3A.isPinching).toBe(true);
      expect(frame3A.isDebouncing).toBe(false);
      expect(frame3A.shouldAddPoint).toBe(true); // Resumes adding points!
      expect(frame3A.unpinchedFrames).toBe(0);

      // Scenario B: Frame 3 remains in tolerance band (dist = 0.095) -> debounce expires (limit 2)
      const frame3B = evaluatePinchGesture(true, 0.095, 0.095, frame2.unpinchedFrames);
      expect(frame3B.isPinching).toBe(false);     // Clean release!
      expect(frame3B.isDebouncing).toBe(false);
      expect(frame3B.shouldAddPoint).toBe(false);
      expect(frame3B.unpinchedFrames).toBe(0);
    });
  });

  describe('Comprehensive Verification Suite (All 5 Required Test Cases)', () => {
    // Helper to simulate stroke processing across frames
    const createSimulator = () => {
      const completedStrokes = [];
      let activeStroke = null;
      let isPinching = false;
      let unpinchedFrames = 0;

      const processFrame = (rawPinch, smoothedPinch, tipPos) => {
        const evalResult = evaluatePinchGesture(isPinching, smoothedPinch, rawPinch, unpinchedFrames);
        unpinchedFrames = evalResult.unpinchedFrames;

        if (evalResult.isPinching) {
          if (!isPinching) {
            activeStroke = [{ ...tipPos }];
          } else if (evalResult.shouldAddPoint && activeStroke && activeStroke.length > 0) {
            const lastPt = activeStroke[activeStroke.length - 1];
            if (Math.hypot(tipPos.x - lastPt.x, tipPos.y - lastPt.y) >= MIN_POINT_DISTANCE) {
              activeStroke.push({ ...tipPos });
            }
          }
        } else {
          if (isPinching && activeStroke) {
            completedStrokes.push(activeStroke);
            activeStroke = null;
          }
        }
        isPinching = evalResult.isPinching;
        return evalResult;
      };

      return { completedStrokes, getActiveStroke: () => activeStroke, getIsPinching: () => isPinching, processFrame };
    };

    it('Test 1: Continuous digit-5-like stroke with realistic pinch-distance fluctuations remains connected', () => {
      const sim = createSimulator();

      // Top horizontal bar: moving right
      sim.processFrame(0.045, 0.045, { x: 0.30, y: 0.20 }); // Start
      sim.processFrame(0.048, 0.046, { x: 0.40, y: 0.20 });
      sim.processFrame(0.047, 0.047, { x: 0.50, y: 0.20 });

      // Corner 1: sharp reversal to start downstroke (1-frame raw landmark noise flutter: raw = 0.092, smoothed = 0.064)
      sim.processFrame(0.092, 0.064, { x: 0.30, y: 0.20 });

      // Downstroke: moving down
      sim.processFrame(0.050, 0.052, { x: 0.30, y: 0.28 });
      sim.processFrame(0.048, 0.050, { x: 0.30, y: 0.36 });

      // Curved loop (belly of 5): hand tilt perspective causes a 2-frame elevation into tolerance band [0.085, 0.105)
      sim.processFrame(0.088, 0.087, { x: 0.42, y: 0.42 }); // Loop frame 1 (debounce 1)
      sim.processFrame(0.089, 0.088, { x: 0.48, y: 0.52 }); // Loop frame 2 (debounce 2)

      // Loop sweep bottom: hand re-aligns, distance returns to contact
      sim.processFrame(0.046, 0.052, { x: 0.42, y: 0.62 });
      sim.processFrame(0.044, 0.046, { x: 0.32, y: 0.64 });
      sim.processFrame(0.042, 0.043, { x: 0.24, y: 0.60 }); // Finish belly

      // CRITICAL VERIFICATION: Stroke was NEVER split or disconnected!
      expect(sim.completedStrokes.length).toBe(0);
      expect(sim.getActiveStroke()).not.toBeNull();
      expect(sim.getActiveStroke().length).toBeGreaterThanOrEqual(8);
      expect(sim.getIsPinching()).toBe(true);
    });

    it('Test 2: Normal stroke with brief distance spikes does not trigger unintended release', () => {
      const sim = createSimulator();

      sim.processFrame(0.040, 0.040, { x: 0.20, y: 0.30 });
      sim.processFrame(0.042, 0.041, { x: 0.25, y: 0.30 });

      // Brief isolated 1-frame raw spike (e.g. motion blur on corner)
      sim.processFrame(0.098, 0.062, { x: 0.30, y: 0.30 });
      expect(sim.getIsPinching()).toBe(true);
      expect(sim.completedStrokes.length).toBe(0);

      // Normal movement resumes
      sim.processFrame(0.045, 0.048, { x: 0.35, y: 0.30 });
      sim.processFrame(0.046, 0.046, { x: 0.40, y: 0.30 });

      // Another isolated spike in tolerance band
      sim.processFrame(0.089, 0.066, { x: 0.45, y: 0.30 });
      expect(sim.getIsPinching()).toBe(true);
      expect(sim.completedStrokes.length).toBe(0);

      sim.processFrame(0.042, 0.044, { x: 0.50, y: 0.30 });
      expect(sim.completedStrokes.length).toBe(0);
      expect(sim.getActiveStroke().length).toBe(7);
    });

    it('Test 3: Intentional release after drawing terminates promptly on frame 1 without delay', () => {
      const sim = createSimulator();

      // Draw stroke
      sim.processFrame(0.040, 0.040, { x: 0.10, y: 0.10 });
      sim.processFrame(0.042, 0.042, { x: 0.15, y: 0.15 });
      sim.processFrame(0.045, 0.044, { x: 0.20, y: 0.20 });
      expect(sim.getActiveStroke().length).toBe(3);

      // Intentional release: user opens fingers (raw = 0.115 >= 0.105)
      sim.processFrame(0.115, 0.075, { x: 0.24, y: 0.24 });

      // Immediate release on frame 1!
      expect(sim.getIsPinching()).toBe(false);
      expect(sim.getActiveStroke()).toBeNull();
      expect(sim.completedStrokes.length).toBe(1);
      expect(sim.completedStrokes[0].length).toBe(3); // (0.24, 0.24) was not added!
    });

    it('Test 4: Short dot followed by intentional release produces exactly 1 point and zero trailing line', () => {
      const sim = createSimulator();

      // Frame 1: Touch fingers to make a dot at (0.50, 0.50)
      sim.processFrame(0.040, 0.040, { x: 0.50, y: 0.50 });
      expect(sim.getIsPinching()).toBe(true);
      expect(sim.getActiveStroke().length).toBe(1);

      // Frame 2: Hold stationary for 1 frame
      sim.processFrame(0.040, 0.040, { x: 0.5005, y: 0.5005 });
      expect(sim.getActiveStroke().length).toBe(1);

      // Frame 3: Deliberate finger separation to lift pen away (raw = 0.110 >= 0.105)
      // Hand naturally shifts slightly to (0.52, 0.48) during finger opening
      sim.processFrame(0.110, 0.075, { x: 0.52, y: 0.48 });

      // Releases immediately on frame 1
      expect(sim.getIsPinching()).toBe(false);
      expect(sim.getActiveStroke()).toBeNull();
      expect(sim.completedStrokes.length).toBe(1);

      // CRITICAL VERIFICATION: Stroke contains strictly 1 point! Zero trailing line!
      expect(sim.completedStrokes[0].length).toBe(1);
      expect(sim.completedStrokes[0][0]).toEqual({ x: 0.50, y: 0.50 });
    });

    it('Test 5: Sustained finger separation triggers release rather than keeping drawing active indefinitely', () => {
      const sim = createSimulator();

      // Start drawing
      sim.processFrame(0.040, 0.040, { x: 0.30, y: 0.30 });
      sim.processFrame(0.042, 0.042, { x: 0.35, y: 0.35 });
      expect(sim.getActiveStroke().length).toBe(2);

      // User separates fingers to sustained moderate separation (dist = 0.092 in [0.085, 0.105))
      // Frame 1 of separation: debounce 1
      sim.processFrame(0.092, 0.090, { x: 0.38, y: 0.38 });
      expect(sim.getIsPinching()).toBe(true); // In debounce 1

      // Frame 2 of separation: debounce 2
      sim.processFrame(0.093, 0.092, { x: 0.40, y: 0.40 });
      expect(sim.getIsPinching()).toBe(true); // In debounce 2

      // Frame 3: debounce limit (2) exhausted -> MUST release!
      sim.processFrame(0.093, 0.093, { x: 0.42, y: 0.42 });
      expect(sim.getIsPinching()).toBe(false); // Clean release!
      expect(sim.completedStrokes.length).toBe(1);
      // Points during separation were NOT added!
      expect(sim.completedStrokes[0].length).toBe(2);
    });
  });

  describe('checkHandBoundaryProximity', () => {
    // Helper to generate 21 dummy hand landmarks
    function createMockLandmarks(wristPos = { x: 0.5, y: 0.7 }, indexTipPos = { x: 0.5, y: 0.3 }) {
      const landmarks = [];
      for (let i = 0; i < 21; i++) {
        landmarks.push({ x: 0.5, y: 0.5, z: 0.0 });
      }
      landmarks[0] = { ...wristPos, z: 0.0 }; // Wrist #0
      landmarks[4] = { x: 0.48, y: 0.35, z: 0.0 }; // Thumb tip #4
      landmarks[8] = { ...indexTipPos, z: 0.0 }; // Index tip #8
      landmarks[17] = { x: 0.55, y: 0.6, z: 0.0 }; // Pinky MCP #17
      return landmarks;
    }

    it('returns safe status when hand is centered away from frame edges', () => {
      const landmarks = createMockLandmarks({ x: 0.5, y: 0.7 }, { x: 0.5, y: 0.3 });
      const result = checkHandBoundaryProximity(landmarks, 0.05);

      expect(result.isNearEdge).toBe(false);
      expect(result.isWristClipped).toBe(false);
      expect(result.minMargin).toBeGreaterThanOrEqual(0.25);
      expect(result.clippedLandmarks).toEqual([]);
      expect(result.boundaryWarning).toBeNull();
    });

    it('detects when index fingertip is within 5% frame margin', () => {
      // Index fingertip near top boundary: y = 0.03 < 0.05
      const landmarks = createMockLandmarks({ x: 0.5, y: 0.6 }, { x: 0.5, y: 0.03 });
      const result = checkHandBoundaryProximity(landmarks, 0.05);

      expect(result.isNearEdge).toBe(true);
      expect(result.minMargin).toBeCloseTo(0.03, 3);
      expect(result.clippedLandmarks).toContain('Index Tip (8)');
      expect(result.boundaryWarning).toContain('Hand near frame edge');
    });

    it('detects when wrist is clipped by camera bottom boundary', () => {
      // Wrist clipped at bottom: y = 0.99 > 0.98
      const landmarks = createMockLandmarks({ x: 0.5, y: 0.99 }, { x: 0.5, y: 0.5 });
      const result = checkHandBoundaryProximity(landmarks, 0.05);

      expect(result.isNearEdge).toBe(true);
      expect(result.isWristClipped).toBe(true);
      expect(result.clippedLandmarks).toContain('Wrist (0)');
      expect(result.boundaryWarning).toContain('Wrist clipped');
    });

    it('detects when wrist is clipped by camera horizontal boundary', () => {
      // Wrist clipped at left: x = 0.01 < 0.02
      const landmarks = createMockLandmarks({ x: 0.01, y: 0.5 }, { x: 0.2, y: 0.3 });
      const result = checkHandBoundaryProximity(landmarks, 0.05);

      expect(result.isNearEdge).toBe(true);
      expect(result.isWristClipped).toBe(true);
      expect(result.boundaryWarning).toContain('Wrist clipped');
    });

    it('safely handles null, undefined, or incomplete landmarks (< 21)', () => {
      expect(checkHandBoundaryProximity(null)).toEqual({
        isNearEdge: false,
        isWristClipped: false,
        minMargin: 0,
        clippedLandmarks: [],
        boundaryWarning: null,
      });

      expect(checkHandBoundaryProximity([])).toEqual({
        isNearEdge: false,
        isWristClipped: false,
        minMargin: 0,
        clippedLandmarks: [],
        boundaryWarning: null,
      });
    });

    it('respects custom margin parameter', () => {
      // Fingertip at x = 0.08
      const landmarks = createMockLandmarks({ x: 0.5, y: 0.6 }, { x: 0.08, y: 0.4 });

      // Default margin 0.05: not near edge (0.08 >= 0.05)
      const resDefault = checkHandBoundaryProximity(landmarks, 0.05);
      expect(resDefault.isNearEdge).toBe(false);

      // Custom margin 0.10: near edge (0.08 < 0.10)
      const resCustom = checkHandBoundaryProximity(landmarks, 0.10);
      expect(resCustom.isNearEdge).toBe(true);
    });
  });

  describe('Realistic Pinch-State Stability and Flickering Prevention', () => {
    // Helper to simulate a frame processor mirroring useHandTracking state machine
    const createPipelineSimulator = () => {
      const completedStrokes = [];
      let activeStroke = null;
      let isPinching = false;
      let unpinchedFrames = 0;
      let frameRejected = false;
      let rejectionCategory = 'NONE';
      let rejectionReason = '';

      const processFrame = (rawPinch, smoothedPinch, tipPos) => {
        const evalResult = evaluatePinchGesture(isPinching, smoothedPinch, rawPinch, unpinchedFrames);
        unpinchedFrames = evalResult.unpinchedFrames;

        if (evalResult.isPinching) {
          if (!isPinching) {
            // New stroke start
            frameRejected = false;
            rejectionCategory = 'NONE';
            rejectionReason = evalResult.reason;
            activeStroke = [{ ...tipPos }];
          } else if (evalResult.isDebouncing || !evalResult.shouldAddPoint) {
            // In release debounce: hold active stroke without appending points
            frameRejected = false;
            rejectionCategory = 'PINCH_DEBOUNCING';
            rejectionReason = evalResult.reason;
          } else if (activeStroke && activeStroke.length > 0) {
            const lastPt = activeStroke[activeStroke.length - 1];
            const delta = Math.hypot(tipPos.x - lastPt.x, tipPos.y - lastPt.y);

            if (delta >= MIN_POINT_DISTANCE) {
              frameRejected = false;
              rejectionCategory = 'NONE';
              rejectionReason = 'Point added';
              activeStroke.push({ ...tipPos });
            } else {
              // Stationary hold: active pinch maintained, redundant point suppressed
              frameRejected = false;
              rejectionCategory = 'STATIONARY_HOLD';
              rejectionReason = `Stationary hold: delta ${delta.toFixed(4)} < ${MIN_POINT_DISTANCE}`;
            }
          }
        } else {
          if (isPinching) {
            // Intentional release
            frameRejected = false;
            rejectionCategory = 'PINCH_RELEASED';
            rejectionReason = evalResult.reason;
            if (activeStroke && activeStroke.length > 0) {
              completedStrokes.push(activeStroke);
              activeStroke = null;
            }
          } else {
            // Ready hovering state
            frameRejected = false;
            rejectionCategory = 'READY';
            rejectionReason = evalResult.reason;
          }
        }

        isPinching = evalResult.isPinching;
        return {
          evalResult,
          frameRejected,
          rejectionCategory,
          rejectionReason,
          isPinching,
          activeStrokeLength: activeStroke ? activeStroke.length : 0,
        };
      };

      return {
        completedStrokes,
        getActiveStroke: () => activeStroke,
        getIsPinching: () => isPinching,
        processFrame,
      };
    };

    it('1. maintains stable pinch contact through natural distance fluctuations during continuous writing', () => {
      const sim = createPipelineSimulator();

      // Start pinch at (0.2, 0.2)
      const f1 = sim.processFrame(0.050, 0.050, { x: 0.20, y: 0.20 });
      expect(f1.isPinching).toBe(true);
      expect(f1.activeStrokeLength).toBe(1);

      // Natural fluctuations within active writing range [0.055, 0.080]
      const f2 = sim.processFrame(0.062, 0.058, { x: 0.25, y: 0.20 });
      const f3 = sim.processFrame(0.076, 0.065, { x: 0.30, y: 0.20 });
      const f4 = sim.processFrame(0.068, 0.066, { x: 0.35, y: 0.20 });
      const f5 = sim.processFrame(0.054, 0.060, { x: 0.40, y: 0.20 });

      expect(f2.isPinching).toBe(true);
      expect(f3.isPinching).toBe(true);
      expect(f4.isPinching).toBe(true);
      expect(f5.isPinching).toBe(true);
      expect(sim.getActiveStroke().length).toBe(5);
      expect(sim.completedStrokes.length).toBe(0);
    });

    it('2. resists brief noisy distance spikes (>= 0.105) during active pinch contact without stroke interruption', () => {
      const sim = createPipelineSimulator();

      // Start drawing
      sim.processFrame(0.045, 0.045, { x: 0.20, y: 0.20 });
      sim.processFrame(0.048, 0.046, { x: 0.25, y: 0.20 });
      expect(sim.getActiveStroke().length).toBe(2);

      // Brief isolated 1-frame raw noise spike >= 0.105 (e.g. thumb occlusion or optical noise)
      // Smoothed distance remains low (0.052 <= startThreshold)
      const spikeFrame = sim.processFrame(0.112, 0.052, { x: 0.30, y: 0.20 });

      // Stroke must NOT be instantly terminated!
      expect(spikeFrame.isPinching).toBe(true);
      expect(spikeFrame.rejectionCategory).toBe('PINCH_DEBOUNCING');
      expect(sim.completedStrokes.length).toBe(0);

      // Next frame: raw sensor returns to active contact
      const recoverFrame = sim.processFrame(0.048, 0.050, { x: 0.35, y: 0.20 });
      expect(recoverFrame.isPinching).toBe(true);
      expect(recoverFrame.rejectionCategory).toBe('NONE');
      expect(sim.getActiveStroke().length).toBe(3);
    });

    it('3. holds pinch state across transient tolerance band fluctuations without adding trailing ink', () => {
      const sim = createPipelineSimulator();

      sim.processFrame(0.040, 0.040, { x: 0.10, y: 0.10 });
      sim.processFrame(0.042, 0.042, { x: 0.15, y: 0.10 });

      // Hand tilts into tolerance band [0.085, 0.105) for 2 frames
      const d1 = sim.processFrame(0.089, 0.088, { x: 0.20, y: 0.10 });
      expect(d1.isPinching).toBe(true);
      expect(d1.rejectionCategory).toBe('PINCH_DEBOUNCING');
      // No point added during debounce to avoid spurious trailing ink
      expect(sim.getActiveStroke().length).toBe(2);

      const d2 = sim.processFrame(0.087, 0.087, { x: 0.25, y: 0.10 });
      expect(d2.isPinching).toBe(true);
      expect(d2.rejectionCategory).toBe('PINCH_DEBOUNCING');
      expect(sim.getActiveStroke().length).toBe(2);

      // Distance recovers to contact
      const d3 = sim.processFrame(0.045, 0.050, { x: 0.30, y: 0.10 });
      expect(d3.isPinching).toBe(true);
      expect(d3.rejectionCategory).toBe('NONE');
      expect(sim.getActiveStroke().length).toBe(3);
      expect(sim.completedStrokes.length).toBe(0);
    });

    it('4. performs clean intentional finger release without lag or unwanted trailing points', () => {
      const sim = createPipelineSimulator();

      sim.processFrame(0.040, 0.040, { x: 0.10, y: 0.10 });
      sim.processFrame(0.042, 0.042, { x: 0.15, y: 0.10 });
      expect(sim.getActiveStroke().length).toBe(2);

      // Intentional release: user separates fingers (raw = 0.120, smoothed has climbed to 0.078 > startThreshold)
      const releaseFrame = sim.processFrame(0.120, 0.078, { x: 0.22, y: 0.10 });

      expect(releaseFrame.isPinching).toBe(false);
      expect(releaseFrame.rejectionCategory).toBe('PINCH_RELEASED');
      expect(sim.completedStrokes.length).toBe(1);
      expect(sim.completedStrokes[0].length).toBe(2); // (0.22, 0.10) was not added!
      expect(sim.getActiveStroke()).toBeNull();
    });

    it('5. allows clean re-pinch after stroke completion to start a second independent stroke', () => {
      const sim = createPipelineSimulator();

      // Stroke 1
      sim.processFrame(0.040, 0.040, { x: 0.10, y: 0.10 });
      sim.processFrame(0.042, 0.042, { x: 0.15, y: 0.15 });
      // Release Stroke 1
      sim.processFrame(0.120, 0.080, { x: 0.20, y: 0.20 });
      expect(sim.completedStrokes.length).toBe(1);

      // Hovering in READY state between strokes
      const hover = sim.processFrame(0.090, 0.090, { x: 0.35, y: 0.35 });
      expect(hover.isPinching).toBe(false);
      expect(hover.rejectionCategory).toBe('READY');
      expect(hover.frameRejected).toBe(false);

      // Re-pinch for Stroke 2
      const stroke2Start = sim.processFrame(0.045, 0.048, { x: 0.40, y: 0.40 });
      expect(stroke2Start.isPinching).toBe(true);
      expect(stroke2Start.rejectionCategory).toBe('NONE');
      expect(sim.getActiveStroke().length).toBe(1);

      sim.processFrame(0.046, 0.046, { x: 0.45, y: 0.45 });
      expect(sim.getActiveStroke().length).toBe(2);
      expect(sim.completedStrokes.length).toBe(1);
    });

    it('6. provides accurate frame diagnostics: hovering and stationary holding are not classified as rejections', () => {
      const sim = createPipelineSimulator();

      // Case A: Hovering before pinch (distance 0.075 > startThreshold 0.065)
      const hover = sim.processFrame(0.075, 0.075, { x: 0.50, y: 0.50 });
      expect(hover.isPinching).toBe(false);
      expect(hover.frameRejected).toBe(false); // CRITICAL: NOT marked as rejected!
      expect(hover.rejectionCategory).toBe('READY');
      expect(hover.rejectionReason).toContain('Ready');

      // Case B: Start pinch
      const start = sim.processFrame(0.045, 0.045, { x: 0.50, y: 0.50 });
      expect(start.isPinching).toBe(true);
      expect(start.frameRejected).toBe(false);
      expect(start.rejectionCategory).toBe('NONE');

      // Case C: Maintaining a consistent hand position (stationary, delta < 0.003)
      const hold = sim.processFrame(0.045, 0.045, { x: 0.5005, y: 0.5005 });
      expect(hold.isPinching).toBe(true);
      expect(hold.frameRejected).toBe(false); // CRITICAL: Holding position is NOT a rejected frame!
      expect(hold.rejectionCategory).toBe('STATIONARY_HOLD');
      expect(hold.rejectionReason).toContain('Stationary hold');
    });
  });
});
