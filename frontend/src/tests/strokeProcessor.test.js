import { describe, it, expect } from 'vitest';
import {
  cloneStrokes,
  sanitizeStrokes,
  smoothStroke,
  smoothStrokes,
  computeStrokeArcLength,
  resampleStroke,
  resampleStrokes,
  computeBoundingBox,
  normalizeStrokes,
  processStrokes,
} from '../services/strokeProcessor';

describe('Milestone M4: Stroke Sanitization & Immutability', () => {
  it('handles empty, null, undefined, and non-array inputs safely', () => {
    expect(sanitizeStrokes(null)).toEqual([]);
    expect(sanitizeStrokes(undefined)).toEqual([]);
    expect(sanitizeStrokes([])).toEqual([]);
    expect(sanitizeStrokes([[]])).toEqual([]);
    expect(sanitizeStrokes('not-an-array')).toEqual([]);
  });

  it('filters out invalid points (NaN, Infinity, non-numeric) while keeping valid points', () => {
    const rawStrokes = [
      [
        { x: 0.1, y: 0.1 },
        { x: NaN, y: 0.2 },
        { x: 0.3, y: Infinity },
        { x: null, y: 0.4 },
        { x: 0.5, y: 0.5 },
      ],
    ];

    const sanitized = sanitizeStrokes(rawStrokes);
    expect(sanitized.length).toBe(1);
    expect(sanitized[0].length).toBe(2);
    expect(sanitized[0][0]).toEqual({ x: 0.1, y: 0.1 });
    expect(sanitized[0][1]).toEqual({ x: 0.5, y: 0.5 });
  });

  it('removes consecutive identical duplicate points', () => {
    const rawStrokes = [
      [
        { x: 0.2, y: 0.3 },
        { x: 0.2, y: 0.3 }, // Duplicate
        { x: 0.25, y: 0.35 },
        { x: 0.25, y: 0.35 }, // Duplicate
      ],
    ];

    const sanitized = sanitizeStrokes(rawStrokes);
    expect(sanitized[0].length).toBe(2);
    expect(sanitized[0][0]).toEqual({ x: 0.2, y: 0.3 });
    expect(sanitized[0][1]).toEqual({ x: 0.25, y: 0.35 });
  });

  it('guarantees immutability and never mutates raw input data', () => {
    const originalStrokes = [
      [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }],
      [{ x: 0.5, y: 0.6 }],
    ];
    const snapshot = JSON.stringify(originalStrokes);

    const cloned = cloneStrokes(originalStrokes);
    cloned[0][0].x = 0.999;

    expect(JSON.stringify(originalStrokes)).toBe(snapshot);
    expect(originalStrokes[0][0].x).toBe(0.1);

    // Also verify processStrokes preserves raw input
    processStrokes(originalStrokes);
    expect(JSON.stringify(originalStrokes)).toBe(snapshot);
  });
});

describe('Milestone M4: Very Short Strokes and Single-Point Dots', () => {
  it('preserves single-point tap dots through all pipeline stages', () => {
    const dotStroke = [{ x: 0.4, y: 0.4 }];
    const sanitized = sanitizeStrokes([dotStroke]);
    expect(sanitized.length).toBe(1);
    expect(sanitized[0].length).toBe(1);

    const smoothed = smoothStroke(sanitized[0]);
    expect(smoothed).toEqual([{ x: 0.4, y: 0.4 }]);

    const resampled = resampleStroke(sanitized[0]);
    expect(resampled).toEqual([{ x: 0.4, y: 0.4 }]);

    const normalized = normalizeStrokes([sanitized[0]]);
    expect(normalized.normalizedStrokes.length).toBe(1);
    expect(normalized.normalizedStrokes[0].length).toBe(1);
  });

  it('handles zero-length 2-point stationary strokes', () => {
    const stationaryStroke = [{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }];
    const sanitized = sanitizeStrokes([stationaryStroke]);
    // Sanitization deduplicates to 1 point
    expect(sanitized[0].length).toBe(1);

    const resampled = resampleStroke(sanitized[0]);
    expect(resampled.length).toBe(1);
  });
});

describe('Milestone M4: Smoothing & Jitter Reduction', () => {
  it('reduces high-frequency spatial noise while preserving stroke endpoints', () => {
    // A horizontal stroke with alternating vertical jitter
    const noisyStroke = [
      { x: 0.1, y: 0.50 }, // Start
      { x: 0.2, y: 0.54 }, // + jitter
      { x: 0.3, y: 0.46 }, // - jitter
      { x: 0.4, y: 0.53 }, // + jitter
      { x: 0.5, y: 0.47 }, // - jitter
      { x: 0.6, y: 0.50 }, // End
    ];

    const smoothed = smoothStroke(noisyStroke, { iterations: 2, preserveEndpoints: true });

    // Endpoints must match original exactly
    expect(smoothed[0].x).toBe(0.1);
    expect(smoothed[0].y).toBe(0.50);
    expect(smoothed[smoothed.length - 1].x).toBe(0.6);
    expect(smoothed[smoothed.length - 1].y).toBe(0.50);

    // Intermediate points should be smoothed closer to y = 0.50
    for (let i = 1; i < smoothed.length - 1; i++) {
      expect(Math.abs(smoothed[i].y - 0.50)).toBeLessThan(0.025);
    }
  });

  it('handles multiple passes (iterations) cleanly', () => {
    const stroke = [
      { x: 0.0, y: 0.0 },
      { x: 0.5, y: 0.8 },
      { x: 1.0, y: 0.0 },
    ];

    const pass1 = smoothStroke(stroke, { iterations: 1 });
    const pass3 = smoothStroke(stroke, { iterations: 3 });

    // With more passes, peak at 0.5 pulls downward from 0.8 to 0.40
    expect(pass1[1].y).toBe(0.40);
    expect(pass3[1].y).toBeLessThan(pass1[1].y);

    // Test smoothStrokes array helper
    const multiSmooth = smoothStrokes([stroke, stroke], { iterations: 1 });
    expect(multiSmooth.length).toBe(2);
    expect(multiSmooth[0][1].y).toBe(0.40);
  });
});

describe('Milestone M4: Point Resampling along Arc-Length', () => {
  it('calculates accurate polyline arc-length', () => {
    // 3-4-5 right triangle segment: (0,0) -> (3,4) = length 5
    const stroke = [{ x: 0, y: 0 }, { x: 3, y: 4 }];
    expect(computeStrokeArcLength(stroke)).toBeCloseTo(5.0, 4);

    // Multi-segment polyline
    const line = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
    expect(computeStrokeArcLength(line)).toBeCloseTo(2.0, 4);
  });

  it('resamples stroke with uniform spatial spacing (mode: spacing)', () => {
    // Straight line of length 1.0 with unevenly clustered raw points
    const stroke = [
      { x: 0.0, y: 0.5 },
      { x: 0.01, y: 0.5 }, // Dense
      { x: 0.02, y: 0.5 }, // Dense
      { x: 0.50, y: 0.5 }, // Sparse jump
      { x: 1.00, y: 0.5 }, // Final
    ];

    const resampled = resampleStroke(stroke, { mode: 'spacing', spacing: 0.1 });
    expect(resampled.length).toBeGreaterThan(5);

    // Verify distance between consecutive resampled points is consistent
    const stepDist = Math.hypot(resampled[1].x - resampled[0].x, resampled[1].y - resampled[0].y);
    for (let i = 2; i < resampled.length; i++) {
      const d = Math.hypot(resampled[i].x - resampled[i - 1].x, resampled[i].y - resampled[i - 1].y);
      expect(d).toBeCloseTo(stepDist, 3);
    }

    // Verify endpoints
    expect(resampled[0].x).toBe(0.0);
    expect(resampled[resampled.length - 1].x).toBe(1.0);
  });

  it('resamples stroke to an exact target point count (mode: count)', () => {
    const stroke = [
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.7 },
      { x: 0.9, y: 0.1 },
    ];

    const resampled32 = resampleStroke(stroke, { mode: 'count', targetPoints: 32 });
    expect(resampled32.length).toBe(32);

    const resampled64 = resampleStroke(stroke, { mode: 'count', targetPoints: 64 });
    expect(resampled64.length).toBe(64);

    expect(resampled32[0]).toEqual({ x: 0.1, y: 0.1 });
    expect(resampled32[31].x).toBeCloseTo(0.9, 3);
    expect(resampled32[31].y).toBeCloseTo(0.1, 3);

    // Test resampleStrokes multi-stroke helper
    const multiResampled = resampleStrokes([stroke, stroke], { mode: 'count', targetPoints: 16 });
    expect(multiResampled.length).toBe(2);
    expect(multiResampled[0].length).toBe(16);
    expect(multiResampled[1].length).toBe(16);
  });
});

describe('Milestone M4: Aspect-Ratio Preserving Normalization', () => {
  it('preserves aspect ratio for wide strokes (e.g. minus sign "-")', () => {
    // Width = 0.50, Height = 0.02 (aspect ratio = 25.0)
    const minusSign = [
      [{ x: 0.25, y: 0.50 }, { x: 0.75, y: 0.52 }],
    ];

    const normResult = normalizeStrokes(minusSign, { padding: 0.05, preserveAspectRatio: true });
    const normBbox = computeBoundingBox(normResult.normalizedStrokes);

    // In a square-stretched normalization, width and height would both be ~0.90
    // But with aspect-ratio preservation, width must be much larger than height!
    expect(normBbox.width).toBeGreaterThan(0.80);
    expect(normBbox.height).toBeLessThan(0.10);
    expect(normBbox.width / normBbox.height).toBeCloseTo(0.50 / 0.02, 1);
  });

  it('preserves aspect ratio for tall strokes (e.g. digit "1" or vertical bar "|")', () => {
    // Width = 0.02, Height = 0.60 (aspect ratio = 0.033)
    const verticalBar = [
      [{ x: 0.50, y: 0.20 }, { x: 0.52, y: 0.80 }],
    ];

    const normResult = normalizeStrokes(verticalBar, { padding: 0.05, preserveAspectRatio: true });
    const normBbox = computeBoundingBox(normResult.normalizedStrokes);

    expect(normBbox.height).toBeGreaterThan(0.80);
    expect(normBbox.width).toBeLessThan(0.10);
  });

  it('centers the normalized geometry within unit square [0, 1] x [0, 1]', () => {
    const circle = [
      [
        { x: 0.1, y: 0.1 },
        { x: 0.3, y: 0.1 },
        { x: 0.3, y: 0.3 },
        { x: 0.1, y: 0.3 },
      ],
    ];

    const normResult = normalizeStrokes(circle, { padding: 0.05, preserveAspectRatio: true });
    const bbox = computeBoundingBox(normResult.normalizedStrokes);

    // Center should be approximately (0.5, 0.5)
    expect(bbox.centerX).toBeCloseTo(0.5, 2);
    expect(bbox.centerY).toBeCloseTo(0.5, 2);
  });
});

describe('Milestone M4: Multi-Stroke Symbols & Expression Preservation', () => {
  it('preserves relative spatial arrangement in multi-stroke symbol (plus sign "+")', () => {
    // Horizontal stroke: (0.3, 0.5) -> (0.7, 0.5)
    // Vertical stroke: (0.5, 0.3) -> (0.5, 0.7)
    const plusSign = [
      [{ x: 0.3, y: 0.5 }, { x: 0.7, y: 0.5 }],
      [{ x: 0.5, y: 0.3 }, { x: 0.5, y: 0.7 }],
    ];

    const result = processStrokes(plusSign);
    expect(result.strokeCount).toBe(2);

    const s1 = result.strokes[0];
    const s2 = result.strokes[1];

    // Stroke 1 is horizontal (constant Y, varying X)
    expect(s1[0].y).toBeCloseTo(s1[s1.length - 1].y, 2);
    expect(Math.abs(s1[s1.length - 1].x - s1[0].x)).toBeGreaterThan(0.5);

    // Stroke 2 is vertical (constant X, varying Y)
    expect(s2[0].x).toBeCloseTo(s2[s2.length - 1].x, 2);
    expect(Math.abs(s2[s2.length - 1].y - s2[0].y)).toBeGreaterThan(0.5);

    // Intersection remains at center
    expect((s1[0].x + s1[s1.length - 1].x) / 2).toBeCloseTo((s2[0].x + s2[s2.length - 1].x) / 2, 2);
  });

  it('preserves vertical hierarchy in mathematical expression (fraction a / b)', () => {
    // Numerator "1" (top), fraction bar "-" (middle), Denominator "2" (bottom)
    const fraction = [
      [{ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.3 }], // Numerator
      [{ x: 0.3, y: 0.5 }, { x: 0.7, y: 0.5 }], // Fraction line
      [{ x: 0.4, y: 0.7 }, { x: 0.6, y: 0.7 }, { x: 0.4, y: 0.9 }, { x: 0.6, y: 0.9 }], // Denominator
    ];

    const result = processStrokes(fraction);
    expect(result.strokeCount).toBe(3);

    const normNumerator = result.strokes[0];
    const normLine = result.strokes[1];
    const normDenominator = result.strokes[2];

    const numY = normNumerator[normNumerator.length - 1].y;
    const lineY = normLine[0].y;
    const denY = normDenominator[0].y;

    // Numerator is strictly above fraction bar, and fraction bar is strictly above denominator
    expect(numY).toBeLessThan(lineY);
    expect(lineY).toBeLessThan(denY);
  });

  it('strictly preserves stroke order (temporal sequence 0, 1, 2)', () => {
    const raw = [
      [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }], // Stroke 0
      [{ x: 0.3, y: 0.3 }, { x: 0.4, y: 0.4 }], // Stroke 1
      [{ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.6 }], // Stroke 2
    ];

    const result = processStrokes(raw);
    expect(result.strokes.length).toBe(3);
    expect(result.strokes[0][0].x).toBeLessThan(result.strokes[1][0].x);
    expect(result.strokes[1][0].x).toBeLessThan(result.strokes[2][0].x);
  });
});

describe('Milestone M4: Complete ProcessStrokes Pipeline Diagnostics', () => {
  it('returns rich metadata, points count, and execution duration', () => {
    const raw = [
      Array.from({ length: 50 }, (_, i) => ({ x: 0.2 + i * 0.01, y: 0.3 })),
      Array.from({ length: 40 }, (_, i) => ({ x: 0.4, y: 0.1 + i * 0.01 })),
    ];

    const result = processStrokes(raw, {
      resampling: { mode: 'spacing', spacing: 0.02 },
    });

    expect(result.rawStrokes.length).toBe(2);
    expect(result.inSituStrokes.length).toBe(2);
    expect(result.strokeCount).toBe(2);
    expect(result.pointCountRaw).toBe(90);
    // Point count after resampling should be compressed and clean
    expect(result.pointCountProcessed).toBeLessThan(90);
    expect(result.processingDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.boundingBox.width).toBeGreaterThan(0);
    expect(result.aspectRatio).toBeGreaterThan(0);
    expect(result.config.smoothing.enabled).toBe(true);
    expect(result.config.resampling.enabled).toBe(true);
    expect(result.config.normalization.enabled).toBe(true);
  });
});
