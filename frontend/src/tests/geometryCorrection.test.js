import { describe, it, expect } from 'vitest';
import {
  processStrokes,
  normalizeStrokes,
  computeStrokeArcLength,
  computeBoundingBox,
  renderComparisonStrokes,
} from '../services/strokeProcessor';
import { renderStrokesToCanvas } from '../services/airWriting';
import { extractStrokeFeatures } from '../services/symbolFeatures';

describe('Phase 2: Geometry & Aspect-Ratio Correction', () => {
  // Helper to generate a circle drawn with physical dimensions on a specific canvas resolution
  function createPhysicalCircle(canvasW, canvasH, radiusPx = 100, numPoints = 64) {
    const centerPx = { x: canvasW / 2, y: canvasH / 2 };
    const stroke = [];
    for (let i = 0; i <= numPoints; i++) {
      const theta = (i / numPoints) * 2 * Math.PI;
      const px = centerPx.x + radiusPx * Math.cos(theta);
      const py = centerPx.y + radiusPx * Math.sin(theta);
      stroke.push({
        x: px / canvasW,
        y: py / canvasH,
      });
    }
    return [stroke];
  }

  // Helper to generate a physical diagonal stroke
  function createPhysicalDiagonal(canvasW, canvasH, spanPx = 200, numPoints = 32) {
    const startPx = { x: 200, y: 200 + spanPx };
    const stroke = [];
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const px = startPx.x + t * spanPx;
      const py = startPx.y - t * spanPx; // 45 degrees upward to the right
      stroke.push({
        x: px / canvasW,
        y: py / canvasH,
      });
    }
    return [stroke];
  }

  it('corrects circular stroke and digit 0 geometry on a 16:9 canvas', () => {
    const canvasW = 1280;
    const canvasH = 720;
    const circleStrokes = createPhysicalCircle(canvasW, canvasH, 120);

    // In raw canvas coordinates, width is squished by 16:9 (0.5625)
    const rawBbox = computeBoundingBox(circleStrokes);
    expect(rawBbox.width / rawBbox.height).toBeCloseTo(720 / 1280, 2);

    // Process with the actual surface aspect ratio
    const processed = processStrokes(circleStrokes, {
      surfaceAspectRatio: canvasW / canvasH,
    });

    // 1. Physical aspect ratio must be 1.0 (circular)
    expect(processed.aspectRatio).toBeCloseTo(1.0, 2);

    // 2. Normalized strokes in [0, 1] x [0, 1] must have equal width and height (~0.900)
    const normBbox = computeBoundingBox(processed.strokes);
    expect(normBbox.width).toBeCloseTo(0.90, 2);
    expect(normBbox.height).toBeCloseTo(0.90, 2);
    expect(normBbox.width / normBbox.height).toBeCloseTo(1.0, 2);

    // 3. Extracted Feature 72 (Aspect Ratio normalized to [0, 2] -> / 2.0)
    const feats = extractStrokeFeatures(processed.strokes, processed.aspectRatio);
    expect(feats[72]).toBeCloseTo(0.50, 2); // 1.0 / 2.0 = 0.50

    // 4. Grid occupancy spans columns 1 through 6 symmetrically
    const colSums = new Array(8).fill(0);
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        colSums[c] += feats[r * 8 + c];
      }
    }
    expect(colSums[1]).toBeGreaterThan(0.05);
    expect(colSums[6]).toBeGreaterThan(0.05);
  });

  it('preserves geometry for a Digit 8 with two stacked circular loops on a 16:9 display', () => {
    const canvasW = 1280;
    const canvasH = 720;
    const loopRadiusPx = 60; // 120px diameter each
    const centerPx = { x: 640, y: 360 };

    // Top loop
    const topLoop = [];
    // Bottom loop
    const bottomLoop = [];
    for (let i = 0; i <= 32; i++) {
      const theta = (i / 32) * 2 * Math.PI;
      topLoop.push({
        x: (centerPx.x + loopRadiusPx * Math.cos(theta)) / canvasW,
        y: (centerPx.y - loopRadiusPx + loopRadiusPx * Math.sin(theta)) / canvasH,
      });
      bottomLoop.push({
        x: (centerPx.x + loopRadiusPx * Math.cos(theta)) / canvasW,
        y: (centerPx.y + loopRadiusPx + loopRadiusPx * Math.sin(theta)) / canvasH,
      });
    }

    const digit8Strokes = [topLoop, bottomLoop];

    const processed = processStrokes(digit8Strokes, {
      surfaceAspectRatio: canvasW / canvasH,
    });

    // Overall digit 8 has width = 120px, height = 240px -> aspect ratio = 0.50
    expect(processed.aspectRatio).toBeCloseTo(0.50, 2);

    // In unit box: height is max dimension (~0.90), width should be ~0.45
    const normBbox = computeBoundingBox(processed.strokes);
    expect(normBbox.height).toBeCloseTo(0.90, 2);
    expect(normBbox.width).toBeCloseTo(0.45, 2);
  });

  it('preserves narrow aspect ratio for a vertical Digit 1 on a 16:9 display', () => {
    const canvasW = 1280;
    const canvasH = 720;
    // Physical stroke: 10px wide, 300px tall
    const digit1 = [
      Array.from({ length: 30 }, (_, i) => ({
        x: (640 + (i % 2 === 0 ? -5 : 5)) / canvasW,
        y: (200 + i * 10) / canvasH,
      })),
    ];

    const processed = processStrokes(digit1, {
      surfaceAspectRatio: canvasW / canvasH,
    });

    // Physical aspect ratio = 10 / 300 ~ 0.033
    expect(processed.aspectRatio).toBeLessThan(0.06);

    const normBbox = computeBoundingBox(processed.strokes);
    expect(normBbox.height).toBeCloseTo(0.90, 2);
    expect(normBbox.width).toBeLessThan(0.10);
    // Centered horizontally around 0.50
    expect(normBbox.centerX).toBeCloseTo(0.50, 2);
  });

  it('preserves exact 45-degree angle for diagonal strokes on a 16:9 display', () => {
    const canvasW = 1280;
    const canvasH = 720;
    const diagonal = createPhysicalDiagonal(canvasW, canvasH, 200);

    const processed = processStrokes(diagonal, {
      surfaceAspectRatio: canvasW / canvasH,
    });

    // Bounding box of normalized stroke
    const normBbox = computeBoundingBox(processed.strokes);
    // Equal width and height in normalized space
    expect(normBbox.width).toBeCloseTo(0.90, 2);
    expect(normBbox.height).toBeCloseTo(0.90, 2);

    // Slope angle: dy / dx
    const pStart = processed.strokes[0][0];
    const pEnd = processed.strokes[0][processed.strokes[0].length - 1];
    const dx = pEnd.x - pStart.x;
    const dy = -(pEnd.y - pStart.y); // upward in canvas is negative y

    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    // Must be 45 degrees, NOT steepened to 60.6 degrees!
    expect(angleDeg).toBeCloseTo(45.0, 1);
  });

  it('guarantees geometric shape invariance across different display aspect ratios', () => {
    const aspectRatios = [
      { name: '16:9 Standard', w: 1280, h: 720 },
      { name: '4:3 Traditional', w: 800, h: 600 },
      { name: '1:1 Square', w: 600, h: 600 },
      { name: '21:9 Ultrawide', w: 2560, h: 1080 },
    ];

    for (const { name, w, h } of aspectRatios) {
      const circleStrokes = createPhysicalCircle(w, h, 100);
      const processed = processStrokes(circleStrokes, {
        surfaceAspectRatio: w / h,
      });

      // Regardless of canvas ratio, the circle's physical aspect ratio MUST be 1.00
      expect(processed.aspectRatio, `${name} physical AR`).toBeCloseTo(1.0, 2);

      // Normalized unit box dimensions MUST be 0.90 x 0.90
      const normBbox = computeBoundingBox(processed.strokes);
      expect(normBbox.width, `${name} normalized width`).toBeCloseTo(0.90, 2);
      expect(normBbox.height, `${name} normalized height`).toBeCloseTo(0.90, 2);

      // Feature 72 must remain identical across all display ratios
      const feats = extractStrokeFeatures(processed.strokes, processed.aspectRatio);
      expect(feats[72], `${name} feature 72`).toBeCloseTo(0.50, 2);
    }
  });

  it('preserves M4 Raw, Processed (in-situ), and Compare rendering functionality', () => {
    const canvasW = 1280;
    const canvasH = 720;
    const rawStrokes = createPhysicalCircle(canvasW, canvasH, 100);

    const processed = processStrokes(rawStrokes, {
      surfaceAspectRatio: canvasW / canvasH,
    });

    // 1. inSituStrokes must stay in canvas-normalized coordinates [0, 1] to match raw strokes
    expect(processed.inSituStrokes.length).toBe(1);
    const inSituBbox = computeBoundingBox(processed.inSituStrokes);
    const rawBbox = computeBoundingBox(rawStrokes);

    // In-situ bounding box center must match raw bounding box center
    expect(inSituBbox.centerX).toBeCloseTo(rawBbox.centerX, 2);
    expect(inSituBbox.centerY).toBeCloseTo(rawBbox.centerY, 2);

    // Mock canvas context for render verification
    const mockCtx = {
      clearRect: () => {},
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      setLineDash: () => {},
    };

    // 2. Raw mode rendering
    expect(() => {
      renderStrokesToCanvas(mockCtx, rawStrokes, canvasW, canvasH);
    }).not.toThrow();

    // 3. Processed (in-situ) mode rendering
    expect(() => {
      renderStrokesToCanvas(mockCtx, processed.inSituStrokes, canvasW, canvasH);
    }).not.toThrow();

    // 4. Comparison mode rendering
    expect(() => {
      renderComparisonStrokes(
        mockCtx,
        rawStrokes,
        processed.inSituStrokes,
        canvasW,
        canvasH,
        (pt, w, h) => ({ x: pt.x * w, y: pt.y * h })
      );
    }).not.toThrow();
  });
});
