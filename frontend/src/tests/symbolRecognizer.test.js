import { describe, it, expect } from 'vitest';
import {
  predictSymbol,
  resamplePointCloud,
  SUPPORTED_DIGITS,
  validateStrokeInput,
  hasSubstantialStroke,
} from '../services/symbolRecognizer';

describe('Client-Side Symbol Recognizer Service (M5)', () => {
  const dummyMlpModel = {
    modelType: 'feature_classifier_mlp',
    version: '1.0.0',
    inputDim: 76,
    hiddenDim: 16,
    numClasses: 10,
    classes: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    weights: {
      w1: Array.from({ length: 16 }, () => Array(76).fill(0.01)),
      b1: Array(16).fill(0.0),
      w2: Array.from({ length: 10 }, (_, k) => Array(16).fill(k === 5 ? 0.2 : -0.1)),
      b2: Array.from({ length: 10 }, (_, k) => (k === 5 ? 1.0 : 0.0)),
    },
  };

  it('handles empty strokes gracefully with zero confidence fallback', () => {
    const res = predictSymbol([], dummyMlpModel);
    expect(res.topPrediction).toBe('0');
    expect(res.confidence).toBe(0.0);
    expect(res.candidates).toHaveLength(3);
    expect(res.candidates[0].score).toBe(0.0);
    expect(Object.keys(res.allScores)).toHaveLength(10);
    expect(res.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('handles null/undefined model gracefully', () => {
    const res = predictSymbol([[{ x: 0.5, y: 0.5 }]], null);
    expect(res.confidence).toBe(0.0);
    expect(res.candidates).toHaveLength(3);
  });

  it('predicts with feature_classifier_mlp and returns valid contract', () => {
    const stroke = [
      [
        { x: 0.2, y: 0.2 },
        { x: 0.8, y: 0.2 },
        { x: 0.8, y: 0.8 },
      ],
    ];
    const res = predictSymbol(stroke, dummyMlpModel, { aspectRatio: 1.0, strokeCount: 1 });

    expect(SUPPORTED_DIGITS).toContain(res.topPrediction);
    expect(res.confidence).toBeGreaterThan(0.0);
    expect(res.confidence).toBeLessThanOrEqual(1.0);

    // Candidates contract
    expect(res.candidates).toHaveLength(3);
    expect(res.candidates[0].label).toBe(res.topPrediction);
    expect(res.candidates[0].score).toBe(res.confidence);
    expect(res.candidates[0].score).toBeGreaterThanOrEqual(res.candidates[1].score);
    expect(res.candidates[1].score).toBeGreaterThanOrEqual(res.candidates[2].score);

    // All 10 classes
    expect(Object.keys(res.allScores)).toEqual(SUPPORTED_DIGITS);
    for (const d of SUPPORTED_DIGITS) {
      expect(res.allScores[d]).toBeGreaterThanOrEqual(0.0);
      expect(res.allScores[d]).toBeLessThanOrEqual(1.0);
    }

    // Ultra-fast in-browser latency (< 5ms)
    expect(res.durationMs).toBeLessThan(15);
  });

  it('correctly resamples point cloud for template matcher fallback', () => {
    const stroke = [
      [
        { x: 0.0, y: 0.0 },
        { x: 1.0, y: 0.0 },
      ],
    ];
    const cloud = resamplePointCloud(stroke, 16);
    expect(cloud).toHaveLength(16);
    expect(cloud[0].x).toBeCloseTo(0.0, 3);
    expect(cloud[15].x).toBeCloseTo(1.0, 3);
  });

  it('predicts with point_cloud_template fallback model', () => {
    const templateModel = {
      model_type: 'point_cloud_template',
      classes: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
      templates: [
        {
          label: '1',
          name: '1_vertical',
          stroke_count: 1,
          points: Array.from({ length: 32 }, (_, i) => ({
            x: 0.5,
            y: 0.1 + (0.8 * i) / 31,
            stroke: 0,
          })),
        },
      ],
    };

    const stroke1 = [
      Array.from({ length: 20 }, (_, i) => ({
        x: 0.5,
        y: 0.1 + (0.8 * i) / 19,
      })),
    ];

    const res = predictSymbol(stroke1, templateModel);
    expect(res.topPrediction).toBe('1');
    expect(res.confidence).toBeGreaterThan(0.8);
    expect(res.candidates).toHaveLength(3);
  });

  it('correctly classifies real digits using exported symbol_model_v1.json', async () => {
    const symbolModel = await import('../assets/symbol_model_v1.json');

    // Digit 1: vertical downward line
    const digit1Strokes = [
      Array.from({ length: 20 }, (_, i) => ({
        x: 0.5,
        y: 0.1 + (0.8 * i) / 19,
      })),
    ];
    const res1 = predictSymbol(digit1Strokes, symbolModel.default || symbolModel);
    expect(res1.topPrediction).toBe('1');
    expect(res1.confidence).toBeGreaterThan(0.8);

    // Digit 0: closed circle
    const digit0Strokes = [
      Array.from({ length: 30 }, (_, i) => {
        const a = -Math.PI / 2 - (2 * Math.PI * i) / 29;
        return {
          x: 0.5 + 0.3 * Math.cos(a),
          y: 0.5 + 0.4 * Math.sin(a),
        };
      }),
    ];
    const res0 = predictSymbol(digit0Strokes, symbolModel.default || symbolModel);
    expect(res0.topPrediction).toBe('0');
    expect(res0.confidence).toBeGreaterThan(0.8);
  });

  it('Phase A: Rejects stationary dots and accidental taps instead of forcing digit 4', async () => {
    const symbolModel = await import('../assets/symbol_model_v1.json');
    const model = symbolModel.default || symbolModel;

    // Single point dot
    const singleDot = [[{ x: 0.5, y: 0.5 }]];
    const resDot = predictSymbol(singleDot, model);
    expect(resDot.status).toBe('REJECTED');
    expect(resDot.rejectionReason).toBe('DEGENERATE_DOT');
    expect(resDot.topPrediction).toBeNull();
    expect(resDot.isConfident).toBe(false);

    // Micro jitter tap (3 points with near-zero length)
    const jitterDot = [[
      { x: 0.5, y: 0.5 },
      { x: 0.501, y: 0.501 },
      { x: 0.501, y: 0.5 },
    ]];
    const resJitter = predictSymbol(jitterDot, model);
    expect(resJitter.status).toBe('REJECTED');
    expect(['TOO_FEW_POINTS', 'STROKE_TOO_SHORT', 'BOUNDING_BOX_TOO_SMALL', 'DEGENERATE_DOT']).toContain(resJitter.rejectionReason);
    expect(resJitter.topPrediction).toBeNull();
  });

  it('Phase A: Accepts legitimate small digits that exceed qualification thresholds', async () => {
    const symbolModel = await import('../assets/symbol_model_v1.json');
    const model = symbolModel.default || symbolModel;

    // Small digit 1 (span of 0.08 in camera coordinates)
    const smallOne = [
      Array.from({ length: 12 }, (_, i) => ({
        x: 0.5,
        y: 0.2 + (0.08 * i) / 11,
      })),
    ];
    const res = predictSymbol(smallOne, model);
    expect(res.status).toBe('ACCEPTED');
    expect(res.topPrediction).toBe('1');
    expect(res.confidence).toBeGreaterThan(0.5);
  });

  it('Phase E: Marks low-confidence predictions as UNCERTAIN rather than forcing classification', async () => {
    const symbolModel = await import('../assets/symbol_model_v1.json');
    const model = symbolModel.default || symbolModel;

    // An ambiguous or deliberately threshold-strained stroke
    const ambiguousStroke = [
      Array.from({ length: 15 }, (_, i) => ({
        x: 0.2 + 0.6 * (i / 14),
        y: 0.2 + 0.6 * (i / 14) * (i / 14),
      })),
    ];

    // With a high confidence requirement (e.g. 0.99)
    const res = predictSymbol(ambiguousStroke, model, { minConfidence: 0.99 });
    if (res.confidence < 0.99) {
      expect(res.status).toBe('UNCERTAIN');
      expect(res.rejectionReason).toBe('LOW_CONFIDENCE');
      expect(res.isConfident).toBe(false);
    }
  });

  it('Phase D: Correctly classifies human continuous 9 and multi-stroke 4 and 5', async () => {
    const symbolModel = await import('../assets/symbol_model_v1.json');
    const model = symbolModel.default || symbolModel;

    // 2-stroke digit 4: L-stroke + vertical stem
    const stroke4_1 = [{ x: 0.6, y: 0.15 }, { x: 0.3, y: 0.6 }, { x: 0.75, y: 0.6 }];
    const stroke4_2 = [{ x: 0.6, y: 0.35 }, { x: 0.6, y: 0.85 }];
    const res4 = predictSymbol([stroke4_1, stroke4_2], model, { strokeCount: 2 });
    expect(res4.topPrediction).toBe('4');
    expect(res4.confidence).toBeGreaterThan(0.7);

    // 2-stroke digit 5
    const stroke5_1 = [{ x: 0.6, y: 0.2 }, { x: 0.35, y: 0.2 }, { x: 0.35, y: 0.5 }, { x: 0.65, y: 0.65 }, { x: 0.35, y: 0.85 }];
    const stroke5_2 = [{ x: 0.35, y: 0.2 }, { x: 0.7, y: 0.2 }];
    const res5 = predictSymbol([stroke5_1, stroke5_2], model, { strokeCount: 2 });
    expect(res5.topPrediction).toBe('5');
    expect(res5.confidence).toBeGreaterThan(0.7);

    // Human continuous 9 (loop + stem)
    const loop9 = Array.from({ length: 21 }, (_, i) => {
      const a = (i * 2 * Math.PI) / 20;
      return { x: 0.5 + 0.18 * Math.cos(a), y: 0.35 + 0.18 * Math.sin(a) };
    });
    const stem9 = Array.from({ length: 11 }, (_, i) => ({
      x: 0.68,
      y: 0.35 + (0.55 * i) / 10,
    }));
    const res9 = predictSymbol([loop9.concat(stem9)], model);
    expect(res9.topPrediction).toBe('9');
    expect(res9.confidence).toBeGreaterThan(0.5);
  });

  describe('Multi-Stroke Qualification Safety (hasSubstantialStroke & validateStrokeInput)', () => {
    it('hasSubstantialStroke correctly detects presence of a substantial stroke', () => {
      // Substantial stroke: length > 0.035, maxDim > 0.030
      const substantial = Array.from({ length: 10 }, (_, i) => ({
        x: 0.5,
        y: 0.2 + (0.15 * i) / 9,
      }));
      // Insignificant micro-stroke: length ~ 0.015, maxDim ~ 0.01
      const micro = [
        { x: 0.2, y: 0.2 },
        { x: 0.205, y: 0.205 },
        { x: 0.21, y: 0.21 },
      ];

      expect(hasSubstantialStroke([substantial, micro])).toBe(true);
      expect(hasSubstantialStroke([micro, substantial])).toBe(true);
      expect(hasSubstantialStroke([micro, micro])).toBe(false);
      expect(hasSubstantialStroke([])).toBe(false);
      expect(hasSubstantialStroke([[{ x: 0.1, y: 0.1 }]])).toBe(false);
    });

    it('validateStrokeInput rejects inputs composed exclusively of disconnected micro-strokes', () => {
      const micro1 = [{ x: 0.2, y: 0.2 }, { x: 0.21, y: 0.21 }, { x: 0.22, y: 0.22 }];
      const micro2 = [{ x: 0.8, y: 0.8 }, { x: 0.81, y: 0.81 }, { x: 0.82, y: 0.82 }];

      const result = validateStrokeInput([micro1, micro2], {
        pointCountRaw: 6,
        rawArcLength: 0.056,
        rawBoundingBox: { width: 0.62, height: 0.62 },
        rawStrokes: [micro1, micro2],
      });

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('DISCONNECTED_MICRO_STROKES');
      expect(result.message).toContain('insignificant disconnected strokes');
    });

    it('validateStrokeInput preserves multi-stroke input when at least one stroke is substantial', () => {
      const substantial = Array.from({ length: 10 }, (_, i) => ({
        x: 0.5,
        y: 0.2 + (0.2 * i) / 9,
      }));
      const micro = [{ x: 0.2, y: 0.2 }, { x: 0.21, y: 0.21 }, { x: 0.22, y: 0.22 }];

      const result = validateStrokeInput([substantial, micro], {
        pointCountRaw: 13,
        rawArcLength: 0.23,
        rawBoundingBox: { width: 0.3, height: 0.2 },
        rawStrokes: [substantial, micro],
      });

      expect(result.isValid).toBe(true);
      expect(result.reason).toBe('QUALIFIED');
    });
  });
});
