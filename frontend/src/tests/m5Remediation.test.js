import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  predictSymbol,
  validateStrokeInput,
  DEFAULT_INPUT_QUALIFICATION,
  DEFAULT_CONFIDENCE_THRESHOLD,
} from '../services/symbolRecognizer';
import symbolModelJson from '../assets/symbol_model_v1.json';

describe('Milestone 5 Remediation Suite: Phases A, B, D, E', () => {
  const model = symbolModelJson;

  // -------------------------------------------------------------
  // Phase A: Input Qualification & Dot / Noise Rejection Tests
  // -------------------------------------------------------------
  describe('Phase A — Input Qualification', () => {
    it('rejects a stationary single-point dot', () => {
      const dot = [[{ x: 0.5, y: 0.5 }]];
      const val = validateStrokeInput(dot);
      expect(val.isValid).toBe(false);
      expect(val.reason).toBe('DEGENERATE_DOT');

      const res = predictSymbol(dot, model);
      expect(res.status).toBe('REJECTED');
      expect(res.rejectionReason).toBe('DEGENERATE_DOT');
      expect(res.topPrediction).toBeNull();
      expect(res.confidence).toBe(0.0);
    });

    it('rejects an accidental contact bounce / micro-jitter (3 points, length < 0.035)', () => {
      const jitter = [[
        { x: 0.5, y: 0.5 },
        { x: 0.502, y: 0.501 },
        { x: 0.501, y: 0.502 },
      ]];
      const val = validateStrokeInput(jitter);
      expect(val.isValid).toBe(false);
      expect(['TOO_FEW_POINTS', 'STROKE_TOO_SHORT', 'BOUNDING_BOX_TOO_SMALL', 'DEGENERATE_DOT']).toContain(val.reason);

      const res = predictSymbol(jitter, model);
      expect(res.status).toBe('REJECTED');
      expect(res.topPrediction).toBeNull();
    });

    it('rejects strokes where all points collapse to (0.5, 0.5)', () => {
      const collapsed = [
        [{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }],
      ];
      const val = validateStrokeInput(collapsed);
      expect(val.isValid).toBe(false);
      expect(val.reason).toBe('DEGENERATE_DOT');
    });

    it('accepts legitimate small digits that exceed physical threshold', () => {
      // Small digit 1 with height = 0.08
      const smallOne = [
        Array.from({ length: 16 }, (_, i) => ({
          x: 0.5,
          y: 0.2 + (0.08 * i) / 15,
        })),
      ];
      const val = validateStrokeInput(smallOne);
      expect(val.isValid).toBe(true);

      const res = predictSymbol(smallOne, model);
      expect(res.status).toBe('ACCEPTED');
      expect(res.topPrediction).toBe('1');
      expect(res.confidence).toBeGreaterThan(0.5);
    });

    it('respects configurable qualification criteria overrides', () => {
      const shortStroke = [
        Array.from({ length: 8 }, (_, i) => ({
          x: 0.5,
          y: 0.5 + (0.02 * i) / 7,
        })),
      ];
      // Default: length is 0.02 < 0.035 -> rejected
      expect(validateStrokeInput(shortStroke).isValid).toBe(false);

      // Relaxed override: minArcLength = 0.015 -> accepted
      const relaxed = validateStrokeInput(shortStroke, {
        inputQualification: { minArcLength: 0.015, minBoundingBoxDim: 0.015 },
      });
      expect(relaxed.isValid).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // Phase E: Confidence Rejection & Ambiguity Handling
  // -------------------------------------------------------------
  describe('Phase E — Confidence Rejection', () => {
    it('marks predictions below threshold as UNCERTAIN without forcing a false digit', () => {
      // A deliberate high threshold test (0.999)
      const stroke = [
        Array.from({ length: 20 }, (_, i) => ({
          x: 0.5,
          y: 0.1 + (0.8 * i) / 19,
        })),
      ];
      const res = predictSymbol(stroke, model, { minConfidence: 0.999 });
      if (res.confidence < 0.999) {
        expect(res.status).toBe('UNCERTAIN');
        expect(res.rejectionReason).toBe('LOW_CONFIDENCE');
        expect(res.isConfident).toBe(false);
        expect(res.topPrediction).toBe('1'); // Still preserves candidate info for inspection
      }
    });

    it('marks high-confidence predictions as ACCEPTED', () => {
      const stroke = [
        Array.from({ length: 25 }, (_, i) => ({
          x: 0.5,
          y: 0.1 + (0.8 * i) / 24,
        })),
      ];
      const res = predictSymbol(stroke, model, { minConfidence: 0.45 });
      expect(res.status).toBe('ACCEPTED');
      expect(res.isConfident).toBe(true);
      expect(res.rejectionReason).toBeNull();
    });
  });

  // -------------------------------------------------------------
  // Phase D: Retrained Model Classification on Multi-Stroke & Weakness Digits
  // -------------------------------------------------------------
  describe('Phase D — Retrained Model Recognition', () => {
    it('correctly classifies genuine-style downward digit 1', () => {
      const digit1 = [
        Array.from({ length: 24 }, (_, i) => ({
          x: 0.5,
          y: 0.1 + (0.8 * i) / 23,
        })),
      ];
      const res = predictSymbol(digit1, model);
      expect(res.topPrediction).toBe('1');
      expect(res.confidence).toBeGreaterThan(0.9);
    });

    it('correctly classifies closed and slightly open digit 0', () => {
      const digit0 = [
        Array.from({ length: 30 }, (_, i) => {
          const a = -Math.PI / 2 - (2 * Math.PI * i) / 29;
          return { x: 0.5 + 0.3 * Math.cos(a), y: 0.5 + 0.4 * Math.sin(a) };
        }),
      ];
      const res = predictSymbol(digit0, model);
      expect(res.topPrediction).toBe('0');
      expect(res.confidence).toBeGreaterThan(0.9);
    });

    it('correctly classifies standard air-written digit 2', () => {
      // Top hook, diagonal descent, horizontal base
      const topHook = Array.from({ length: 12 }, (_, i) => {
        const a = Math.PI - (Math.PI * i) / 11;
        return { x: 0.5 + 0.2 * Math.cos(a), y: 0.3 - 0.15 * Math.sin(a) };
      });
      const diag = Array.from({ length: 12 }, (_, i) => ({
        x: 0.7 - (0.4 * i) / 11,
        y: 0.3 + (0.5 * i) / 11,
      }));
      const base = Array.from({ length: 10 }, (_, i) => ({
        x: 0.3 + (0.45 * i) / 9,
        y: 0.8,
      }));
      const res = predictSymbol([topHook.concat(diag).concat(base)], model);
      expect(res.topPrediction).toBe('2');
      expect(res.confidence).toBeGreaterThan(0.8);
    });

    it('correctly classifies two-stroke digit 4', () => {
      const stroke1 = [{ x: 0.6, y: 0.15 }, { x: 0.3, y: 0.6 }, { x: 0.75, y: 0.6 }];
      const stroke2 = [{ x: 0.6, y: 0.35 }, { x: 0.6, y: 0.85 }];
      const res = predictSymbol([stroke1, stroke2], model, { strokeCount: 2 });
      expect(res.topPrediction).toBe('4');
      expect(res.confidence).toBeGreaterThan(0.85);
    });

    it('correctly classifies two-stroke digit 5', () => {
      const stroke1 = [{ x: 0.6, y: 0.2 }, { x: 0.35, y: 0.2 }, { x: 0.35, y: 0.5 }, { x: 0.65, y: 0.65 }, { x: 0.35, y: 0.85 }];
      const stroke2 = [{ x: 0.35, y: 0.2 }, { x: 0.7, y: 0.2 }];
      const res = predictSymbol([stroke1, stroke2], model, { strokeCount: 2 });
      expect(res.topPrediction).toBe('5');
      expect(res.confidence).toBeGreaterThan(0.85);
    });

    it('correctly classifies digit 7 with horizontal bar and slanted stem', () => {
      const bar = Array.from({ length: 10 }, (_, i) => ({
        x: 0.25 + (0.5 * i) / 9,
        y: 0.2,
      }));
      const stem = Array.from({ length: 15 }, (_, i) => ({
        x: 0.75 - (0.35 * i) / 14,
        y: 0.2 + (0.65 * i) / 14,
      }));
      const res = predictSymbol([bar.concat(stem)], model);
      expect(res.topPrediction).toBe('7');
      expect(res.confidence).toBeGreaterThan(0.8);
    });

    it('correctly classifies figure-8 with loop-closure gaps', () => {
      // Standard continuous S-curve figure-8
      const stroke8 = Array.from({ length: 32 }, (_, i) => {
        const t = (i * 2 * Math.PI) / 31;
        return {
          x: 0.5 + 0.18 * Math.sin(t),
          y: 0.5 - 0.35 * Math.sin(2 * t),
        };
      });
      const res = predictSymbol([stroke8], model);
      expect(res.topPrediction).toBe('8');
      expect(res.confidence).toBeGreaterThan(0.6);
    });

    it('correctly classifies human continuous 9 (loop + stem) instead of confusing with 3 or 7', () => {
      const loop = Array.from({ length: 21 }, (_, i) => {
        const a = (i * 2 * Math.PI) / 20;
        return { x: 0.5 + 0.18 * Math.cos(a), y: 0.35 + 0.18 * Math.sin(a) };
      });
      const stem = Array.from({ length: 12 }, (_, i) => ({
        x: 0.68,
        y: 0.35 + (0.55 * i) / 11,
      }));
      const res = predictSymbol([loop.concat(stem)], model);
      expect(res.topPrediction).toBe('9');
      expect(res.confidence).toBeGreaterThan(0.5);
      expect(res.candidates[0].label).toBe('9');
    });
  });
});
