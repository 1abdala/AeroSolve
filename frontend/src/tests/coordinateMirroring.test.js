import { describe, it, expect } from 'vitest';
import { mapNormalizedToCanvas, calculatePinchDistance } from '../services/airWriting';
import { processStrokes } from '../services/strokeProcessor';
import { extractStrokeFeatures } from '../services/symbolFeatures';

describe('Phase 1: Coordinate Mirroring & Visual Frame Alignment', () => {
  it('ensures stored visual stroke coordinates align with fingertip overlay canvas coordinates', () => {
    const canvasWidth = 1280;
    const canvasHeight = 720;

    // MediaPipe raw landmark (e.g. index fingertip on right side of webcam image, which is user left)
    const mediapipeIndexTip = { x: 0.72, y: 0.35 };

    // Overlay canvas formula: (1 - mediapipeIndexTip.x) * canvasWidth
    const overlayPixelX = (1 - mediapipeIndexTip.x) * canvasWidth;
    const overlayPixelY = mediapipeIndexTip.y * canvasHeight;

    // New M3 storage formula: currentPoint = { x: 1 - mediapipeIndexTip.x, y: mediapipeIndexTip.y }
    const recordedPoint = { x: 1 - mediapipeIndexTip.x, y: mediapipeIndexTip.y };

    // New mapNormalizedToCanvas formula: point.x * canvasWidth
    const inkCanvasPixel = mapNormalizedToCanvas(recordedPoint, canvasWidth, canvasHeight);

    // Both MUST land on the exact same pixel (zero offset, no double-mirroring)
    expect(inkCanvasPixel.x).toBeCloseTo(overlayPixelX, 6);
    expect(inkCanvasPixel.y).toBeCloseTo(overlayPixelY, 6);
  });

  it('prevents double-mirroring during left-to-right visual stroke drawing', () => {
    // User moves hand from visual left to visual right on screen
    // On the mirrored camera video, MediaPipe x goes from 0.8 down to 0.2
    const mediapipeTrajectory = [
      { x: 0.80, y: 0.50 },
      { x: 0.50, y: 0.50 },
      { x: 0.20, y: 0.50 },
    ];

    // Transformed into recorded points in visual frame
    const visualRecordedStroke = mediapipeTrajectory.map((pt) => ({
      x: 1 - pt.x,
      y: pt.y,
    }));

    // In visual frame: x should strictly INCREASE (0.2 -> 0.5 -> 0.8)
    expect(visualRecordedStroke[0].x).toBeCloseTo(0.20, 4);
    expect(visualRecordedStroke[1].x).toBeCloseTo(0.50, 4);
    expect(visualRecordedStroke[2].x).toBeCloseTo(0.80, 4);

    // M4 processed stroke should also preserve left-to-right direction
    const processed = processStrokes([visualRecordedStroke]);
    const normPoints = processed.strokes[0];
    expect(normPoints[normPoints.length - 1].x).toBeGreaterThan(normPoints[0].x);

    // Extracted features: Direction bin for rightward (0 radians) must dominate
    const feats = extractStrokeFeatures(processed.strokes);
    // Bin 4 corresponds to angle around 0 (rightward)
    expect(feats[64 + 4]).toBeGreaterThan(0.90);
  });

  it('verifies orientation-related geometry for Digit 2 in visual coordinates', () => {
    // Digit 2 drawn visually:
    // 1. Top arc: starts (0.35, 0.25) -> curves right to (0.65, 0.25) -> (0.65, 0.45)
    // 2. Diagonal stem down-left: -> (0.35, 0.80)
    // 3. Horizontal base line to right: -> (0.65, 0.80)
    const digit2 = [
      { x: 0.35, y: 0.25 },
      { x: 0.50, y: 0.20 },
      { x: 0.65, y: 0.25 },
      { x: 0.65, y: 0.45 },
      { x: 0.50, y: 0.65 },
      { x: 0.35, y: 0.80 }, // Cusp before base
      { x: 0.50, y: 0.80 },
      { x: 0.65, y: 0.80 }, // End of base
    ];

    const processed = processStrokes([digit2]);
    const pts = processed.strokes[0];

    // The base line must end at the bottom RIGHT:
    // Last point (end of base) must have significantly higher x than the bottom-left cusp
    const lastPoint = pts[pts.length - 1];
    const minPointX = Math.min(...pts.map((p) => p.x));
    const maxPointX = Math.max(...pts.map((p) => p.x));

    expect(lastPoint.x).toBeCloseTo(maxPointX, 2);
    expect(lastPoint.x).toBeGreaterThan(minPointX + 0.2);
    expect(lastPoint.y).toBeGreaterThan(0.85);
  });

  it('verifies orientation-related geometry for Digit 3 in visual coordinates', () => {
    // Digit 3 drawn visually:
    // Starts top-left (0.35, 0.2), curves right to (0.65, 0.35), back to center cusp (0.45, 0.5),
    // curves right to (0.65, 0.65), ends bottom-left (0.35, 0.8)
    const digit3 = [
      { x: 0.35, y: 0.20 },
      { x: 0.55, y: 0.20 },
      { x: 0.65, y: 0.35 },
      { x: 0.55, y: 0.50 },
      { x: 0.45, y: 0.50 }, // Center cusp
      { x: 0.55, y: 0.50 },
      { x: 0.65, y: 0.65 },
      { x: 0.55, y: 0.80 },
      { x: 0.35, y: 0.80 },
    ];

    const processed = processStrokes([digit3]);
    const pts = processed.strokes[0];

    // The lobes bulge to the RIGHT:
    // The maximum x in the stroke must be greater than the start point and end point
    const maxX = Math.max(...pts.map((p) => p.x));
    const startX = pts[0].x;
    const endX = pts[pts.length - 1].x;

    expect(maxX).toBeGreaterThan(startX + 0.2);
    expect(maxX).toBeGreaterThan(endX + 0.2);
  });

  it('verifies orientation-related geometry for Digit 5 in visual coordinates', () => {
    // Digit 5 drawn visually (single stroke variant: top-bar right-to-left, stem down, lobe right):
    // (0.65, 0.20) -> (0.35, 0.20) -> (0.35, 0.50) -> (0.65, 0.65) -> (0.35, 0.80)
    const digit5 = [
      { x: 0.65, y: 0.20 },
      { x: 0.35, y: 0.20 }, // Top bar moves LEFT
      { x: 0.35, y: 0.50 }, // Stem moves DOWN on LEFT side
      { x: 0.55, y: 0.50 },
      { x: 0.65, y: 0.65 }, // Bottom lobe bulges RIGHT
      { x: 0.50, y: 0.80 },
      { x: 0.35, y: 0.80 },
    ];

    const processed = processStrokes([digit5]);
    const pts = processed.strokes[0];

    // First segment (top bar) moves leftward: x starts high and decreases
    expect(pts[0].x).toBeGreaterThan(pts[6].x);

    // The bottom lobe bulges to the right: max x in the lower half (y > 0.5) must be on the right
    const lowerHalfPoints = pts.filter((p) => p.y > 0.5);
    const maxLowerX = Math.max(...lowerHalfPoints.map((p) => p.x));
    const minLowerX = Math.min(...lowerHalfPoints.map((p) => p.x));
    expect(maxLowerX).toBeGreaterThan(minLowerX + 0.2);
  });

  it('verifies orientation-related geometry for Digit 6 in visual coordinates', () => {
    // Digit 6 drawn visually:
    // Starts top-right/center (0.60, 0.20), curves down-left (0.30, 0.55),
    // reaches bottom (0.45, 0.85), curves up-right (0.65, 0.70), loops closed into stem (0.45, 0.55)
    const digit6 = [
      { x: 0.60, y: 0.20 },
      { x: 0.40, y: 0.35 },
      { x: 0.30, y: 0.55 },
      { x: 0.35, y: 0.75 },
      { x: 0.45, y: 0.85 },
      { x: 0.60, y: 0.80 },
      { x: 0.65, y: 0.68 },
      { x: 0.55, y: 0.55 },
      { x: 0.35, y: 0.55 },
    ];

    const processed = processStrokes([digit6]);
    const pts = processed.strokes[0];

    // The start point is on the upper right/center, while the lowest-x point is on the left
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    expect(maxX).toBeGreaterThan(minX + 0.2);

    // The loop is at the bottom: the maximum y point is near the bottom
    const maxY = Math.max(...pts.map((p) => p.y));
    expect(maxY).toBeGreaterThan(0.85);

    // The loop finishes at the middle stem (y around 0.5 - 0.7, x around 0.3 - 0.5)
    const endPoint = pts[pts.length - 1];
    expect(endPoint.y).toBeGreaterThan(0.45);
    expect(endPoint.y).toBeLessThan(0.75);
  });

  it('confirms pinch distance calculation is invariant under coordinate reflection', () => {
    // In camera space:
    const thumbCam = { x: 0.45, y: 0.50 };
    const indexCam = { x: 0.50, y: 0.55 };
    const distCam = calculatePinchDistance(thumbCam, indexCam);

    // In reflected visual space:
    const thumbVisual = { x: 1 - thumbCam.x, y: thumbCam.y };
    const indexVisual = { x: 1 - indexCam.x, y: indexCam.y };
    const distVisual = calculatePinchDistance(thumbVisual, indexVisual);

    // Euclidean distance MUST be identical
    expect(distVisual).toBeCloseTo(distCam, 8);
  });
});
