import { describe, it, expect } from 'vitest';
import { processStrokes } from '../services/strokeProcessor';
import { predictSymbol } from '../services/symbolRecognizer';
import symbolModelJson from '../assets/symbol_model_v1.json';

/**
 * Milestone 5 Phase 3C: End-to-End Input Qualification & Classifier Pipeline Test Suite
 *
 * Exercises the production pathway:
 * Raw collected input -> M4 processing (sanitize, smooth, resample, normalize) -> qualification -> classifier eligibility.
 */
describe('Phase 3C — End-to-End Production Qualification Pipeline', () => {
  const model = symbolModelJson;

  // Helper to run raw strokes through the full production pipeline into predictSymbol
  function runPipeline(rawStrokes, options = {}) {
    const processed = processStrokes(rawStrokes);
    const recognition = predictSymbol(processed.strokes, model, {
      aspectRatio: processed.aspectRatio,
      strokeCount: processed.strokeCount,
      pointCountRaw: processed.pointCountRaw,
      rawArcLength: processed.rawArcLength,
      boundingBox: processed.boundingBox,
      rawBoundingBox: processed.rawBoundingBox,
      rawStrokes: processed.rawStrokes,
      ...options,
    });
    return { processed, recognition };
  }

  // 1. Standard valid digit gesture
  it('1. accepts standard valid digit 1 gesture through production pipeline', () => {
    // 16 points downward line in camera space
    const rawStrokes = [
      Array.from({ length: 16 }, (_, i) => ({
        x: 0.5,
        y: 0.2 + (0.5 * i) / 15,
      })),
    ];
    const { processed, recognition } = runPipeline(rawStrokes);

    expect(processed.pointCountRaw).toBe(16);
    expect(processed.rawArcLength).toBeCloseTo(0.5, 2);
    expect(recognition.status).toBe('ACCEPTED');
    expect(recognition.topPrediction).toBe('1');
    expect(recognition.confidence).toBeGreaterThan(0.8);
  });

  // 2. Legitimate small gesture
  it('2. accepts legitimate small gesture exceeding physical thresholds', () => {
    // Small digit 1: height 0.045, width 0.005, arcLength ~0.045, 12 points
    const rawStrokes = [
      Array.from({ length: 12 }, (_, i) => ({
        x: 0.5 + 0.005 * (i % 2),
        y: 0.2 + (0.045 * i) / 11,
      })),
    ];
    const { processed, recognition } = runPipeline(rawStrokes);

    expect(processed.rawArcLength).toBeGreaterThanOrEqual(0.035);
    expect(Math.max(processed.boundingBox.width, processed.boundingBox.height)).toBeGreaterThanOrEqual(0.030);
    expect(recognition.status).toBe('ACCEPTED');
    expect(recognition.topPrediction).toBe('1');
    expect(recognition.confidence).toBeGreaterThan(0.5);
  });

  // 3. Micro-flick or accidental hook (Phase 2 defect verification)
  it('3. rejects accidental micro-flick despite M4 normalization scale amplification', () => {
    // 6 points moving 0.032 in x and 0.002 in y (length = 0.0321 < 0.035, maxDim = 0.032 >= 0.030)
    const rawStrokes = [
      Array.from({ length: 6 }, (_, i) => ({
        x: 0.5 + (0.032 * i) / 5,
        y: 0.5 + (0.002 * i) / 5,
      })),
    ];
    const { processed, recognition } = runPipeline(rawStrokes);

    // M4 normalization amplifies normalized stroke coordinates by ~28x
    expect(processed.normalizationMeta.scale).toBeGreaterThan(25);
    // Bounding box exceeds 0.030
    expect(Math.max(processed.boundingBox.width, processed.boundingBox.height)).toBeGreaterThanOrEqual(0.030);
    // But raw arc length preserves the physical camera distance (below 0.035)
    expect(processed.rawArcLength).toBeLessThan(0.035);

    // Must be rejected with STROKE_TOO_SHORT
    expect(recognition.status).toBe('REJECTED');
    expect(recognition.rejectionReason).toBe('STROKE_TOO_SHORT');
    expect(recognition.topPrediction).toBeNull();
    expect(recognition.confidence).toBe(0.0);
  });

  // 4. Stationary dot input
  it('4. rejects stationary single-point dot', () => {
    const rawStrokes = [[{ x: 0.5, y: 0.5 }]];
    const { recognition } = runPipeline(rawStrokes);

    expect(recognition.status).toBe('REJECTED');
    expect(recognition.rejectionReason).toBe('DEGENERATE_DOT');
    expect(recognition.topPrediction).toBeNull();
    expect(recognition.confidence).toBe(0.0);
  });

  // 5. Duplicate-point input
  it('5. rejects duplicate-point stationary pinch tap', () => {
    const rawStrokes = [[{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }]];
    const { recognition } = runPipeline(rawStrokes);

    expect(recognition.status).toBe('REJECTED');
    expect(recognition.rejectionReason).toBe('DEGENERATE_DOT');
    expect(recognition.topPrediction).toBeNull();
  });

  // 6. Noisy jitter inside a small bounding box
  it('6. rejects short noisy jitter inside small bounding box', () => {
    // 8 points wandering within a 0.008 x 0.008 box
    const rawStrokes = [[
      { x: 0.500, y: 0.500 },
      { x: 0.503, y: 0.502 },
      { x: 0.501, y: 0.504 },
      { x: 0.504, y: 0.501 },
      { x: 0.502, y: 0.505 },
      { x: 0.505, y: 0.502 },
      { x: 0.501, y: 0.506 },
      { x: 0.504, y: 0.503 },
    ]];
    const { recognition } = runPipeline(rawStrokes);

    expect(recognition.status).toBe('REJECTED');
    expect(['BOUNDING_BOX_TOO_SMALL', 'STROKE_TOO_SHORT']).toContain(recognition.rejectionReason);
    expect(recognition.topPrediction).toBeNull();
  });

  // 7. A two-point gesture with large displacement
  it('7. rejects a two-point displacement jump / tracking glitch', () => {
    // Only 2 raw points jumping across 0.70 of screen (cannot form a valid human digit)
    const rawStrokes = [[{ x: 0.1, y: 0.1 }, { x: 0.8, y: 0.8 }]];
    const { processed, recognition } = runPipeline(rawStrokes);

    // M4 resampling inflates stroke to many points (> 50)
    expect(processed.pointCountProcessed).toBeGreaterThan(16);
    // But raw point count is preserved as 2
    expect(processed.pointCountRaw).toBe(2);

    expect(recognition.status).toBe('REJECTED');
    expect(recognition.rejectionReason).toBe('TOO_FEW_POINTS');
    expect(recognition.topPrediction).toBeNull();
  });

  // 8. Sparse raw input whose processed point count is inflated by resampling
  it('8. rejects sparse raw input inflated by M4 resampling', () => {
    // 3 raw points in small area
    const rawStrokes = [[
      { x: 0.50, y: 0.50 },
      { x: 0.51, y: 0.52 },
      { x: 0.52, y: 0.51 },
    ]];
    const { processed, recognition } = runPipeline(rawStrokes);

    // Raw point count is preserved as 3
    expect(processed.pointCountRaw).toBe(3);

    expect(recognition.status).toBe('REJECTED');
    expect(['TOO_FEW_POINTS', 'BOUNDING_BOX_TOO_SMALL']).toContain(recognition.rejectionReason);
    expect(recognition.topPrediction).toBeNull();
  });

  // 9. Near-zero width gesture
  it('9. accepts near-zero width vertical gesture', () => {
    // Pure vertical line: width 0, height 0.35, 16 points
    const rawStrokes = [
      Array.from({ length: 16 }, (_, i) => ({
        x: 0.5,
        y: 0.2 + (0.35 * i) / 15,
      })),
    ];
    const { recognition } = runPipeline(rawStrokes);

    expect(recognition.status).toBe('ACCEPTED');
    expect(recognition.topPrediction).toBe('1');
  });

  // 10. Near-zero height gesture
  it('10. accepts near-zero height horizontal gesture for qualification', () => {
    // Pure horizontal line: height 0, width 0.35, 16 points
    const rawStrokes = [
      Array.from({ length: 16 }, (_, i) => ({
        x: 0.2 + (0.35 * i) / 15,
        y: 0.5,
      })),
    ];
    const { recognition } = runPipeline(rawStrokes);

    // Should pass qualification gate
    expect(recognition.status).toBe('ACCEPTED');
    expect(recognition.topPrediction).not.toBeNull();
  });

  // 11. Empty input
  it('11. rejects empty stroke input gracefully', () => {
    const rawStrokes = [];
    const { recognition } = runPipeline(rawStrokes);

    expect(recognition.status).toBe('REJECTED');
    expect(recognition.rejectionReason).toBe('EMPTY_STROKES');
    expect(recognition.confidence).toBe(0.0);
  });

  // 12. Large point count with negligible actual movement
  it('12. rejects high point count with negligible movement (finger hovering in place)', () => {
    // 25 raw frames inside a 0.010 x 0.010 box
    const rawStrokes = [
      Array.from({ length: 25 }, (_, i) => ({
        x: 0.5 + 0.005 * Math.sin(i),
        y: 0.5 + 0.005 * Math.cos(i),
      })),
    ];
    const { recognition } = runPipeline(rawStrokes);

    expect(recognition.status).toBe('REJECTED');
    expect(['BOUNDING_BOX_TOO_SMALL', 'STROKE_TOO_SHORT']).toContain(recognition.rejectionReason);
    expect(recognition.topPrediction).toBeNull();
  });

  // 13. A gesture rejected by qualification must not invoke the classifier
  it('13. ensures rejected gestures never invoke the classifier or output predictions', () => {
    // Micro-flick that fails qualification
    const rawStrokes = [
      Array.from({ length: 5 }, (_, i) => ({
        x: 0.5 + 0.002 * i,
        y: 0.5 + 0.002 * i,
      })),
    ];
    const { recognition } = runPipeline(rawStrokes);

    expect(recognition.status).toBe('REJECTED');
    expect(recognition.topPrediction).toBeNull();
    expect(recognition.confidence).toBe(0.0);
    expect(recognition.isConfident).toBe(false);
    // All class scores must be zeroed
    for (let d = 0; d <= 9; d++) {
      expect(recognition.allScores[String(d)]).toBe(0.0);
    }
  });

  // 14. A gesture accepted by qualification must continue through the existing classifier pathway
  it('14. ensures accepted gestures continue through full feature extraction & classification', () => {
    const rawStrokes = [
      Array.from({ length: 16 }, (_, i) => ({
        x: 0.5,
        y: 0.15 + (0.6 * i) / 15,
      })),
    ];
    const { recognition } = runPipeline(rawStrokes);

    expect(recognition.status).toBe('ACCEPTED');
    expect(recognition.topPrediction).toBe('1');
    expect(recognition.confidence).toBeGreaterThan(0.7);
    expect(recognition.candidates).toHaveLength(3);
    expect(recognition.candidates[0].label).toBe('1');
    expect(recognition.candidates[0].score).toBe(recognition.confidence);
    expect(Object.keys(recognition.allScores)).toHaveLength(10);
  });

  // 15. Disconnected micro-clicks rejected (Phase 3 Follow-up)
  it('15. rejects disconnected micro-clicks at opposite screen regions as DISCONNECTED_MICRO_STROKES', () => {
    // Two disconnected micro-clicks:
    // Stroke 1: at (0.30, 0.30) to (0.32, 0.32), 3 pts, arc length = 0.028, maxDim = 0.020 (< 0.030)
    // Stroke 2: at (0.65, 0.65) to (0.67, 0.67), 3 pts, arc length = 0.028, maxDim = 0.020 (< 0.030)
    const rawStrokes = [
      [
        { x: 0.30, y: 0.30 },
        { x: 0.31, y: 0.31 },
        { x: 0.32, y: 0.32 },
      ],
      [
        { x: 0.65, y: 0.65 },
        { x: 0.66, y: 0.66 },
        { x: 0.67, y: 0.67 },
      ],
    ];
    const { processed, recognition } = runPipeline(rawStrokes);

    // Global aggregate metrics satisfy basic single thresholds
    expect(processed.pointCountRaw).toBe(6); // >= 5
    expect(processed.rawArcLength).toBeGreaterThanOrEqual(0.035); // ~0.056 >= 0.035
    expect(Math.max(processed.boundingBox.width, processed.boundingBox.height)).toBeGreaterThanOrEqual(0.030); // ~0.37 >= 0.030

    // But each stroke is sub-threshold: must be rejected
    expect(recognition.status).toBe('REJECTED');
    expect(recognition.rejectionReason).toBe('DISCONNECTED_MICRO_STROKES');
    expect(recognition.topPrediction).toBeNull();
    expect(recognition.confidence).toBe(0.0);
    expect(recognition.isConfident).toBe(false);
    for (let d = 0; d <= 9; d++) {
      expect(recognition.allScores[String(d)]).toBe(0.0);
    }
  });

  // 16. Multiple disconnected micro-taps rejected
  it('16. rejects three disconnected micro-taps whose aggregate arc length exceeds threshold', () => {
    const rawStrokes = [
      [
        { x: 0.20, y: 0.20 },
        { x: 0.208, y: 0.208 },
        { x: 0.212, y: 0.212 },
      ],
      [
        { x: 0.50, y: 0.50 },
        { x: 0.508, y: 0.508 },
        { x: 0.512, y: 0.512 },
      ],
      [
        { x: 0.80, y: 0.80 },
        { x: 0.808, y: 0.808 },
        { x: 0.812, y: 0.812 },
      ],
    ];
    const { processed, recognition } = runPipeline(rawStrokes);

    expect(processed.pointCountRaw).toBe(9);
    expect(recognition.status).toBe('REJECTED');
    expect(recognition.rejectionReason).toBe('DISCONNECTED_MICRO_STROKES');
    expect(recognition.topPrediction).toBeNull();
  });

  // 17. Legitimate multi-stroke digit 4 accepted
  it('17. accepts legitimate 2-stroke digit 4 where both strokes are substantial', () => {
    // Stroke 1: L-stroke (downward vertical + rightward horizontal)
    const stroke1 = [
      ...Array.from({ length: 8 }, (_, i) => ({ x: 0.6, y: 0.2 + (0.35 * i) / 7 })),
      ...Array.from({ length: 6 }, (_, i) => ({ x: 0.6 + (0.25 * (i + 1)) / 6, y: 0.55 })),
    ];
    // Stroke 2: Vertical stem
    const stroke2 = Array.from({ length: 12 }, (_, i) => ({
      x: 0.78,
      y: 0.35 + (0.45 * i) / 11,
    }));
    const rawStrokes = [stroke1, stroke2];
    const { processed, recognition } = runPipeline(rawStrokes);

    expect(processed.strokeCount).toBe(2);
    expect(processed.pointCountRaw).toBe(26);
    expect(recognition.status).toBe('ACCEPTED');
    expect(recognition.topPrediction).not.toBeNull();
    expect(recognition.confidence).toBeGreaterThan(0.4);
  });

  // 18. Legitimate multi-stroke digit 7 with short crossbar accepted
  it('18. accepts legitimate 2-stroke digit 7 where primary stroke is substantial and crossbar is short', () => {
    // Stroke 1: Top bar + diagonal down
    const stroke1 = [
      ...Array.from({ length: 8 }, (_, i) => ({ x: 0.3 + (0.35 * i) / 7, y: 0.2 })),
      ...Array.from({ length: 12 }, (_, i) => ({ x: 0.65 - (0.25 * i) / 11, y: 0.2 + (0.55 * i) / 11 })),
    ];
    // Stroke 2: Small crossbar across the diagonal stem
    const stroke2 = Array.from({ length: 5 }, (_, i) => ({
      x: 0.46 + (0.02 * i) / 4,
      y: 0.45,
    }));
    const rawStrokes = [stroke1, stroke2];
    const { processed, recognition } = runPipeline(rawStrokes);

    expect(processed.strokeCount).toBe(2);
    expect(recognition.status).toBe('ACCEPTED');
    expect(recognition.topPrediction).not.toBeNull();
    expect(recognition.confidence).toBeGreaterThan(0.4);
  });

  // 19. Legitimate multi-stroke digit 5 accepted
  it('19. accepts legitimate 2-stroke digit 5', () => {
    // Stroke 1: Downward stem then curved bottom loop (belly)
    const stroke1 = [
      ...Array.from({ length: 6 }, (_, i) => ({ x: 0.4, y: 0.25 + (0.2 * i) / 5 })),
      ...Array.from({ length: 14 }, (_, i) => {
        const angle = -Math.PI / 2 + (Math.PI * 1.2 * i) / 13;
        return {
          x: 0.45 + 0.15 * Math.cos(angle),
          y: 0.58 + 0.15 * Math.sin(angle),
        };
      }),
    ];
    // Stroke 2: Top horizontal bar
    const stroke2 = Array.from({ length: 8 }, (_, i) => ({
      x: 0.38 + (0.22 * i) / 7,
      y: 0.25,
    }));
    const rawStrokes = [stroke1, stroke2];
    const { processed, recognition } = runPipeline(rawStrokes);

    expect(processed.strokeCount).toBe(2);
    expect(recognition.status).toBe('ACCEPTED');
    expect(recognition.topPrediction).not.toBeNull();
    expect(recognition.confidence).toBeGreaterThan(0.4);
  });

  // 20. Legitimate multi-stroke digit 8 (two-circle snowman) accepted
  it('20. accepts legitimate 2-stroke digit 8 (two loops)', () => {
    // Stroke 1: Top circle
    const stroke1 = Array.from({ length: 16 }, (_, i) => {
      const angle = (2 * Math.PI * i) / 15;
      return {
        x: 0.5 + 0.10 * Math.cos(angle),
        y: 0.35 + 0.10 * Math.sin(angle),
      };
    });
    // Stroke 2: Bottom circle
    const stroke2 = Array.from({ length: 18 }, (_, i) => {
      const angle = (2 * Math.PI * i) / 17;
      return {
        x: 0.5 + 0.13 * Math.cos(angle),
        y: 0.62 + 0.13 * Math.sin(angle),
      };
    });
    const rawStrokes = [stroke1, stroke2];
    const { processed, recognition } = runPipeline(rawStrokes);

    expect(processed.strokeCount).toBe(2);
    expect(recognition.status).toBe('ACCEPTED');
    expect(recognition.topPrediction).not.toBeNull();
    expect(recognition.confidence).toBeGreaterThan(0.4);
  });

  // 21. Ensures rejected multi-stroke gestures never invoke the classifier or output predictions
  it('21. ensures rejected multi-stroke gestures bypass feature extraction and classifier', () => {
    // 2 tiny disconnected micro-strokes
    const rawStrokes = [
      [{ x: 0.2, y: 0.2 }, { x: 0.21, y: 0.21 }, { x: 0.22, y: 0.22 }],
      [{ x: 0.8, y: 0.8 }, { x: 0.81, y: 0.81 }, { x: 0.82, y: 0.82 }],
    ];
    const { recognition } = runPipeline(rawStrokes);

    expect(recognition.status).toBe('REJECTED');
    expect(recognition.rejectionReason).toBe('DISCONNECTED_MICRO_STROKES');
    expect(recognition.topPrediction).toBeNull();
    expect(recognition.confidence).toBe(0.0);
    expect(recognition.isConfident).toBe(false);
    for (let d = 0; d <= 9; d++) {
      expect(recognition.allScores[String(d)]).toBe(0.0);
    }
  });
});
