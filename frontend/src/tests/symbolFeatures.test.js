import { describe, it, expect } from 'vitest';
import {
  extractStrokeFeatures,
  FEATURE_VECTOR_SIZE,
  NUM_DIRECTION_BINS,
} from '../services/symbolFeatures';

describe('Canonical 76-Dimensional Feature Extraction (JavaScript)', () => {
  it('returns an array of 76 zeros for empty or invalid inputs', () => {
    const fEmpty = extractStrokeFeatures([]);
    expect(fEmpty).toHaveLength(FEATURE_VECTOR_SIZE);
    expect(fEmpty.every((v) => v === 0)).toBe(true);

    const fInvalid = extractStrokeFeatures([[], [{ x: NaN, y: 0.5 }]]);
    expect(fInvalid).toHaveLength(FEATURE_VECTOR_SIZE);
    expect(fInvalid.every((v) => v === 0)).toBe(true);
  });

  it('correctly maps a single-point dot', () => {
    const stroke = [[{ x: 0.5, y: 0.5 }]];
    const feats = extractStrokeFeatures(stroke);

    expect(feats).toHaveLength(FEATURE_VECTOR_SIZE);
    // Grid cell (col=4, row=4) -> index 4*8 + 4 = 36
    expect(feats[36]).toBe(1.0);
    // Direction bins should be 0
    for (let b = 0; b < NUM_DIRECTION_BINS; b++) {
      expect(feats[64 + b]).toBe(0);
    }
    // Stroke count: 1/3 ~ 0.333333
    expect(Math.abs(feats[73] - 0.333333)).toBeLessThan(1e-4);
  });

  it('correctly extracts features for a horizontal rightward line', () => {
    const stroke = [
      [
        { x: 0.1, y: 0.5 },
        { x: 0.5, y: 0.5 },
        { x: 0.9, y: 0.5 },
      ],
    ];
    const feats = extractStrokeFeatures(stroke);

    expect(feats).toHaveLength(FEATURE_VECTOR_SIZE);
    const gridSum = feats.slice(0, 64).reduce((acc, v) => acc + v, 0);
    expect(Math.abs(gridSum - 1.0)).toBeLessThan(1e-3);

    // Rightward direction -> bin index 4
    expect(feats[64 + 4]).toBeGreaterThan(0.95);

    // Arc length = 0.8 -> norm arc length ~ 0.266667
    expect(Math.abs(feats[74] - 0.8 / 3.0)).toBeLessThan(1e-3);
    // Endpoint dist = 0.8 -> norm ~ 1.0
    expect(Math.abs(feats[75] - 1.0)).toBeLessThan(1e-2);
  });

  it('maintains numerical parity with Python on test strokes', () => {
    const sampleStrokes = [
      [
        { x: 0.2, y: 0.2 },
        { x: 0.8, y: 0.2 },
        { x: 0.8, y: 0.8 },
        { x: 0.2, y: 0.8 },
      ],
    ];
    const f = extractStrokeFeatures(sampleStrokes, 1.0, 1);

    expect(f).toHaveLength(76);
    expect(f.slice(0, 5)).toEqual([0, 0, 0, 0, 0]);

    // Directional bins: [0, 0, 0, 0, 0.333333, 0, 0.333333, 0.333333]
    const dirs = f.slice(64, 72);
    expect(dirs[4]).toBeCloseTo(0.333333, 4);
    expect(dirs[6]).toBeCloseTo(0.333333, 4);
    expect(dirs[7]).toBeCloseTo(0.333333, 4);

    // Meta features: [0.5, 0.333333, 0.6, 0.333315]
    expect(f[72]).toBeCloseTo(0.5, 4);
    expect(f[73]).toBeCloseTo(0.333333, 4);
    expect(f[74]).toBeCloseTo(0.6, 4);
    expect(f[75]).toBeCloseTo(0.333315, 4);
  });
});
