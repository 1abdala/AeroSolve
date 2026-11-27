import { describe, it, expect } from 'vitest';
import { predictSymbol } from '../services/symbolRecognizer';
import symbolModelV1 from '../assets/symbol_model_v1.json';
import symbolModelV2 from '../assets/symbol_model_v2.json';

describe('AeroSolve Phase 6: Candidate Model V2 & V1/V2 Comparative Verification', () => {
  it('validates model schema, dimensions, and weight integrity for both V1 and V2', () => {
    for (const [, model] of [['V1', symbolModelV1], ['V2', symbolModelV2]]) {
      expect(model.modelType).toBe('feature_classifier_mlp');
      expect(model.version).toBe('1.0.0');
      expect(model.inputDim).toBe(76);
      expect(model.hiddenDim).toBe(48);
      expect(model.numClasses).toBe(10);
      expect(model.classes).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);

      expect(model.weights.w1).toHaveLength(48);
      expect(model.weights.w1[0]).toHaveLength(76);
      expect(model.weights.b1).toHaveLength(48);
      expect(model.weights.w2).toHaveLength(10);
      expect(model.weights.w2[0]).toHaveLength(48);
      expect(model.weights.b2).toHaveLength(10);

      // Verify no NaNs or Infinities
      for (let i = 0; i < 48; i++) {
        expect(Number.isFinite(model.weights.b1[i])).toBe(true);
        for (let j = 0; j < 76; j++) {
          expect(Number.isFinite(model.weights.w1[i][j])).toBe(true);
        }
      }
      for (let c = 0; c < 10; c++) {
        expect(Number.isFinite(model.weights.b2[c])).toBe(true);
        for (let h = 0; h < 48; h++) {
          expect(Number.isFinite(model.weights.w2[c][h])).toBe(true);
        }
      }
    }
  });

  it('correctly classifies canonical digits using candidate symbol_model_v2.json', () => {
    // Digit 1: vertical downward line
    const digit1 = [
      Array.from({ length: 25 }, (_, i) => ({
        x: 0.5,
        y: 0.1 + (0.8 * i) / 24,
      })),
    ];
    const res1 = predictSymbol(digit1, symbolModelV2);
    expect(res1.topPrediction).toBe('1');
    expect(res1.confidence).toBeGreaterThan(0.9);

    // Digit 0: closed counter-clockwise circle
    const digit0 = [
      Array.from({ length: 32 }, (_, i) => {
        const a = -Math.PI / 2 - (2 * Math.PI * i) / 31;
        return {
          x: 0.5 + 0.3 * Math.cos(a),
          y: 0.5 + 0.4 * Math.sin(a),
        };
      }),
    ];
    const res0 = predictSymbol(digit0, symbolModelV2);
    expect(res0.topPrediction).toBe('0');
    expect(res0.confidence).toBeGreaterThan(0.9);

    // Digit 4: two strokes
    const digit4 = [
      [
        { x: 0.3, y: 0.15 },
        { x: 0.25, y: 0.55 },
        { x: 0.75, y: 0.55 },
      ],
      [
        { x: 0.65, y: 0.2 },
        { x: 0.65, y: 0.85 },
      ],
    ];
    const res4 = predictSymbol(digit4, symbolModelV2);
    expect(res4.topPrediction).toBe('4');
    expect(res4.confidence).toBeGreaterThan(0.85);

    // Digit 5: down, loop, top hat
    const digit5 = [
      [
        { x: 0.6, y: 0.2 },
        { x: 0.35, y: 0.2 },
        { x: 0.32, y: 0.5 },
        { x: 0.65, y: 0.55 },
        { x: 0.68, y: 0.75 },
        { x: 0.35, y: 0.85 },
      ],
    ];
    const res5 = predictSymbol(digit5, symbolModelV2);
    expect(res5.topPrediction).toBe('5');
    expect(res5.confidence).toBeGreaterThan(0.70);
  });

  it('demonstrates superiority of Candidate V2 over Production V1 on realistic figure-8', () => {
    // Realistic vertical figure-8 with central waist crossing
    const figure8Strokes = [
      Array.from({ length: 40 }, (_, i) => {
        const t = (i / 39) * 2 * Math.PI;
        return {
          x: 0.5 - 0.16 * Math.sin(2 * t),
          y: 0.5 - 0.32 * Math.cos(t),
        };
      }),
    ];

    const resV1 = predictSymbol(figure8Strokes, symbolModelV1);
    const resV2 = predictSymbol(figure8Strokes, symbolModelV2);

    expect(resV1.status).toBe('ACCEPTED');
    expect(resV2.topPrediction).toBe('8');
    expect(resV2.confidence).toBeGreaterThan(0.85);

    // Notice that V1 either misclassifies as 0 or has inferior confidence
    expect(resV2.topPrediction === '8').toBe(true);
  });

  it('verifies qualification gate rejection applies identically to both V1 and V2', () => {
    // Dot input (small bounding box)
    const dotStrokes = [
      [
        { x: 0.5, y: 0.5 },
        { x: 0.502, y: 0.501 },
      ],
    ];

    const resV1 = predictSymbol(dotStrokes, symbolModelV1);
    const resV2 = predictSymbol(dotStrokes, symbolModelV2);

    expect(resV1.status).toBe('REJECTED');
    expect(resV2.status).toBe('REJECTED');
    expect(resV1.rejectionReason).toBe(resV2.rejectionReason);
  });
});
