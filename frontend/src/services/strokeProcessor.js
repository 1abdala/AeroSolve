/**
 * AeroSolve — Milestone M4: Stroke Processing Pipeline
 *
 * Implements a modular, functional pipeline for converting raw air-writing strokes
 * into clean, smoothed, resampled, and aspect-ratio-normalized digital ink data
 * suitable for online handwriting recognition and mathematical expression parsing.
 *
 * Pipeline Stages:
 *   1. Deep clone & input validation (immutability guarantee)
 *   2. Noise & jitter reduction (weighted binomial smoothing)
 *   3. Consistent arc-length point resampling
 *   4. Coordinate normalization with aspect-ratio preservation
 *   5. Multi-stroke expression aggregation & bounding box analysis
 */

export const DEFAULT_STROKE_CONFIG = {
  smoothing: {
    enabled: true,
    iterations: 2,
    preserveEndpoints: true,
  },
  resampling: {
    enabled: true,
    mode: 'spacing', // 'spacing' | 'count'
    spacing: 0.015,  // Arc-length distance between resampled points
    targetPointsPerStroke: 32, // Used when mode === 'count'
  },
  normalization: {
    enabled: true,
    padding: 0.05,
    preserveAspectRatio: true,
    surfaceAspectRatio: 1.0,
  },
  surfaceAspectRatio: 1.0,
};

/**
 * Deep-clone strokes to guarantee raw input data is never mutated.
 * @param {Array<Array<{x: number, y: number}>>} strokes
 * @returns {Array<Array<{x: number, y: number}>>}
 */
export function cloneStrokes(strokes) {
  if (!Array.isArray(strokes)) return [];
  return strokes.map((stroke) => {
    if (!Array.isArray(stroke)) return [];
    return stroke.map((pt) => ({
      x: pt.x,
      y: pt.y,
      ...(pt.t !== undefined ? { t: pt.t } : {}),
    }));
  });
}

/**
 * Stage 1: Sanitize and validate stroke data.
 * - Filters non-array, null, or undefined inputs.
 * - Discards invalid points (NaN, Infinity, missing coordinates).
 * - Removes consecutive duplicate points within epsilon.
 * - Preserves legitimate single-point dots (e.g. dot of 'i', decimal points).
 *
 * @param {Array<Array<{x: number, y: number}>>} strokes
 * @returns {Array<Array<{x: number, y: number}>>}
 */
export function sanitizeStrokes(strokes) {
  if (!Array.isArray(strokes) || strokes.length === 0) {
    return [];
  }

  const sanitized = [];

  for (const stroke of strokes) {
    if (!Array.isArray(stroke) || stroke.length === 0) continue;

    const validPoints = [];
    for (let i = 0; i < stroke.length; i++) {
      const pt = stroke[i];
      if (
        !pt ||
        typeof pt.x !== 'number' ||
        typeof pt.y !== 'number' ||
        !Number.isFinite(pt.x) ||
        !Number.isFinite(pt.y)
      ) {
        continue;
      }

      // Check if duplicate of immediately preceding point
      if (validPoints.length > 0) {
        const prev = validPoints[validPoints.length - 1];
        const distSq = (pt.x - prev.x) ** 2 + (pt.y - prev.y) ** 2;
        if (distSq < 1e-10) {
          continue;
        }
      }

      validPoints.push({
        x: pt.x,
        y: pt.y,
        ...(pt.t !== undefined ? { t: pt.t } : {}),
      });
    }

    if (validPoints.length > 0) {
      sanitized.push(validPoints);
    }
  }

  return sanitized;
}

/**
 * Stage 2: Smooth a single stroke using weighted 3-point Gaussian/binomial averaging.
 * P'_i = 0.25 * P_{i-1} + 0.50 * P_i + 0.25 * P_{i+1}
 * Endpoints are preserved to maintain exact stroke boundary terminals.
 *
 * @param {Array<{x: number, y: number}>} stroke
 * @param {object} options
 * @returns {Array<{x: number, y: number}>}
 */
export function smoothStroke(stroke, options = {}) {
  if (!Array.isArray(stroke) || stroke.length <= 2) {
    return stroke ? [...stroke] : [];
  }

  const { iterations = 2, preserveEndpoints = true } = options;
  let current = stroke.map((p) => ({ ...p }));

  for (let iter = 0; iter < iterations; iter++) {
    const next = [];
    const len = current.length;

    // Start point
    next.push({ ...current[0] });

    for (let i = 1; i < len - 1; i++) {
      const prev = current[i - 1];
      const curr = current[i];
      const fwd = current[i + 1];

      next.push({
        x: 0.25 * prev.x + 0.5 * curr.x + 0.25 * fwd.x,
        y: 0.25 * prev.y + 0.5 * curr.y + 0.25 * fwd.y,
        ...(curr.t !== undefined ? { t: curr.t } : {}),
      });
    }

    // End point
    if (preserveEndpoints) {
      next.push({ ...current[len - 1] });
    } else {
      const p1 = current[len - 2];
      const p2 = current[len - 1];
      next.push({
        x: 0.5 * p1.x + 0.5 * p2.x,
        y: 0.5 * p1.y + 0.5 * p2.y,
        ...(p2.t !== undefined ? { t: p2.t } : {}),
      });
    }

    current = next;
  }

  return current;
}

/**
 * Apply smoothing to an array of strokes.
 * @param {Array<Array<{x: number, y: number}>>} strokes
 * @param {object} options
 * @returns {Array<Array<{x: number, y: number}>>}
 */
export function smoothStrokes(strokes, options = {}) {
  if (!Array.isArray(strokes)) return [];
  return strokes.map((s) => smoothStroke(s, options));
}

/**
 * Calculate the total arc-length of a stroke polyline.
 * @param {Array<{x: number, y: number}>} stroke
 * @param {number} [surfaceAspectRatio=1.0]
 * @returns {number}
 */
export function computeStrokeArcLength(stroke, surfaceAspectRatio = 1.0) {
  if (!Array.isArray(stroke) || stroke.length <= 1) return 0;
  const S = typeof surfaceAspectRatio === 'number' && surfaceAspectRatio > 0 ? surfaceAspectRatio : 1.0;
  let length = 0;
  for (let i = 1; i < stroke.length; i++) {
    const dx = (stroke[i].x - stroke[i - 1].x) * S;
    const dy = stroke[i].y - stroke[i - 1].y;
    length += Math.hypot(dx, dy);
  }
  return length;
}

/**
 * Stage 3: Resample a single stroke at uniform spatial arc-length intervals.
 * Supports:
 *   - mode: 'spacing' (places a point every `spacing` units)
 *   - mode: 'count' (places exactly `targetPoints` equidistant points)
 *
 * @param {Array<{x: number, y: number}>} stroke
 * @param {object} options
 * @returns {Array<{x: number, y: number}>}
 */
export function resampleStroke(stroke, options = {}) {
  if (!Array.isArray(stroke) || stroke.length === 0) return [];
  if (stroke.length === 1) return [{ ...stroke[0] }];

  const {
    mode = 'spacing',
    spacing = 0.015,
    targetPoints = 32,
    targetPointsPerStroke,
    surfaceAspectRatio = 1.0,
  } = options;

  const S = typeof surfaceAspectRatio === 'number' && surfaceAspectRatio > 0 ? surfaceAspectRatio : 1.0;
  const totalLength = computeStrokeArcLength(stroke, S);

  // If stroke has no length (stationary dot or microscopic tap)
  if (totalLength < 1e-6) {
    return [{ ...stroke[0] }];
  }

  const effectiveTargetPoints = targetPointsPerStroke !== undefined ? targetPointsPerStroke : targetPoints;

  let interval = spacing;
  let numSegments = 0;

  if (mode === 'count') {
    const pointsCount = Math.max(2, effectiveTargetPoints);
    interval = totalLength / (pointsCount - 1);
    numSegments = pointsCount - 1;
  } else {
    // Mode 'spacing'
    interval = Math.max(1e-4, spacing);
    numSegments = Math.max(1, Math.round(totalLength / interval));
    // Recalculate interval so endpoints match exactly
    interval = totalLength / numSegments;
  }

  const resampled = [{ ...stroke[0] }];
  let accumulatedDist = 0;
  let targetDist = interval;

  let currSegIdx = 0;

  while (currSegIdx < stroke.length - 1 && resampled.length < numSegments) {
    const p1 = stroke[currSegIdx];
    const p2 = stroke[currSegIdx + 1];
    const dx = (p2.x - p1.x) * S;
    const dy = p2.y - p1.y;
    const segLength = Math.hypot(dx, dy);

    if (segLength < 1e-7) {
      currSegIdx++;
      continue;
    }

    if (accumulatedDist + segLength >= targetDist) {
      // The target point falls inside segment [p1, p2]
      const distIntoSeg = targetDist - accumulatedDist;
      const t = distIntoSeg / segLength;

      const interpolatedPt = {
        x: p1.x + t * (p2.x - p1.x),
        y: p1.y + t * (p2.y - p1.y),
        ...(p2.t !== undefined && p1.t !== undefined ? { t: p1.t + t * (p2.t - p1.t) } : {}),
      };

      resampled.push(interpolatedPt);
      targetDist += interval;
    } else {
      accumulatedDist += segLength;
      currSegIdx++;
    }
  }

  // Ensure exact final endpoint is always appended
  const lastRaw = stroke[stroke.length - 1];
  const lastResampled = resampled[resampled.length - 1];
  const endDist = Math.hypot((lastRaw.x - lastResampled.x) * S, lastRaw.y - lastResampled.y);

  if (endDist > 1e-4 || resampled.length < 2) {
    resampled.push({ ...lastRaw });
  }

  return resampled;
}

/**
 * Resample an array of strokes.
 * @param {Array<Array<{x: number, y: number}>>} strokes
 * @param {object} options
 * @returns {Array<Array<{x: number, y: number}>>}
 */
export function resampleStrokes(strokes, options = {}) {
  if (!Array.isArray(strokes)) return [];
  return strokes.map((s) => resampleStroke(s, options));
}

/**
 * Compute the aggregate bounding box across all strokes.
 * @param {Array<Array<{x: number, y: number}>>} strokes
 * @returns {{minX: number, minY: number, maxX: number, maxY: number, width: number, height: number, centerX: number, centerY: number}}
 */
export function computeBoundingBox(strokes) {
  if (!Array.isArray(strokes) || strokes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hasPoints = false;

  for (const stroke of strokes) {
    if (!Array.isArray(stroke)) continue;
    for (const pt of stroke) {
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
      hasPoints = true;
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
  }

  if (!hasPoints) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
  }

  const width = maxX - minX;
  const height = maxY - minY;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    centerX: minX + width / 2,
    centerY: minY + height / 2,
  };
}

/**
 * Stage 4: Normalize stroke coordinates to a uniform unit space [0, 1]
 * while strictly preserving true physical aspect ratio and multi-stroke geometry.
 *
 * Accounts for canvas surface aspect ratio (surfaceAspectRatio = canvasWidth / canvasHeight)
 * so that physical circles, squares, and diagonals are never distorted or squished.
 *
 * @param {Array<Array<{x: number, y: number}>>} strokes
 * @param {object} options
 * @returns {{ normalizedStrokes: Array<Array<{x: number, y: number}>>, boundingBox: object, normalizedBoundingBox: object, scale: number, offsetX: number, offsetY: number, aspectRatio: number }}
 */
export function normalizeStrokes(strokes, options = {}) {
  if (!Array.isArray(strokes) || strokes.length === 0) {
    return {
      normalizedStrokes: [],
      boundingBox: computeBoundingBox([]),
      normalizedBoundingBox: computeBoundingBox([]),
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      aspectRatio: 1,
    };
  }

  const {
    padding = 0.05,
    preserveAspectRatio = true,
    surfaceAspectRatio = 1.0,
  } = options;

  const S = typeof surfaceAspectRatio === 'number' && surfaceAspectRatio > 0 ? surfaceAspectRatio : 1.0;

  // Compute isotropic bounds across all strokes
  let minIsoX = Infinity;
  let maxIsoX = -Infinity;
  let minIsoY = Infinity;
  let maxIsoY = -Infinity;
  let minRawX = Infinity;
  let maxRawX = -Infinity;
  let minRawY = Infinity;
  let maxRawY = -Infinity;
  let hasPoints = false;

  for (const stroke of strokes) {
    if (!Array.isArray(stroke)) continue;
    for (const pt of stroke) {
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
      hasPoints = true;
      const isoX = pt.x * S;
      const isoY = pt.y;
      if (isoX < minIsoX) minIsoX = isoX;
      if (isoX > maxIsoX) maxIsoX = isoX;
      if (isoY < minIsoY) minIsoY = isoY;
      if (isoY > maxIsoY) maxIsoY = isoY;

      if (pt.x < minRawX) minRawX = pt.x;
      if (pt.x > maxRawX) maxRawX = pt.x;
      if (pt.y < minRawY) minRawY = pt.y;
      if (pt.y > maxRawY) maxRawY = pt.y;
    }
  }

  const rawWidth = Math.max(0, maxRawX - minRawX);
  const rawHeight = Math.max(0, maxRawY - minRawY);

  if (!hasPoints || (rawWidth === 0 && rawHeight === 0)) {
    const singleDotStrokes = strokes.map((s) => s.map(() => ({ x: 0.5, y: 0.5 })));
    const emptyBbox = computeBoundingBox(strokes);
    return {
      normalizedStrokes: singleDotStrokes,
      boundingBox: emptyBbox,
      normalizedBoundingBox: computeBoundingBox(singleDotStrokes),
      scale: 1,
      offsetX: 0.5,
      offsetY: 0.5,
      aspectRatio: 1,
    };
  }

  const isoWidth = Math.max(0, maxIsoX - minIsoX);
  const isoHeight = Math.max(0, maxIsoY - minIsoY);

  const usableDim = Math.max(0.1, 1.0 - 2 * padding);
  let scaleX = 1;
  let scaleY = 1;

  if (preserveAspectRatio) {
    const maxDim = Math.max(isoWidth, isoHeight, 1e-6);
    const uniformScale = usableDim / maxDim;
    scaleX = uniformScale;
    scaleY = uniformScale;
  } else {
    scaleX = usableDim / Math.max(isoWidth, 1e-6);
    scaleY = usableDim / Math.max(isoHeight, 1e-6);
  }

  const scaledWidth = isoWidth * scaleX;
  const scaledHeight = isoHeight * scaleY;

  // Center inside [0, 1] x [0, 1] with padding
  const offsetX = (1.0 - scaledWidth) / 2;
  const offsetY = (1.0 - scaledHeight) / 2;

  const normalizedStrokes = strokes.map((stroke) =>
    stroke.map((pt) => ({
      x: Number(((pt.x * S - minIsoX) * scaleX + offsetX).toFixed(5)),
      y: Number(((pt.y - minIsoY) * scaleY + offsetY).toFixed(5)),
      ...(pt.t !== undefined ? { t: pt.t } : {}),
    }))
  );

  const physicalAspectRatio = isoHeight > 1e-6 ? Number((isoWidth / isoHeight).toFixed(3)) : 1;

  const bbox = {
    minX: minRawX,
    minY: minRawY,
    maxX: maxRawX,
    maxY: maxRawY,
    width: isoWidth,
    height: isoHeight,
    rawWidth,
    rawHeight,
    centerX: minRawX + rawWidth / 2,
    centerY: minRawY + rawHeight / 2,
    aspectRatio: physicalAspectRatio,
    surfaceAspectRatio: S,
  };

  const normalizedBoundingBox = computeBoundingBox(normalizedStrokes);

  return {
    normalizedStrokes,
    boundingBox: bbox,
    normalizedBoundingBox,
    scale: scaleX,
    offsetX,
    offsetY,
    aspectRatio: physicalAspectRatio,
  };
}

/**
 * Execute the complete stroke processing pipeline:
 * Raw Strokes -> Sanitize -> Smooth -> Resample -> Normalize
 *
 * Pure functional execution: does NOT mutate raw input data.
 *
 * @param {Array<Array<{x: number, y: number}>>} rawStrokes
 * @param {object} config
 * @returns {object} Pipeline processing result
 */
export function processStrokes(rawStrokes, config = {}) {
  const t0 = performance.now();
  const surfaceAspectRatio =
    config.surfaceAspectRatio ||
    config.normalization?.surfaceAspectRatio ||
    1.0;

  const mergedConfig = {
    smoothing: { ...DEFAULT_STROKE_CONFIG.smoothing, ...(config.smoothing || {}) },
    resampling: {
      ...DEFAULT_STROKE_CONFIG.resampling,
      surfaceAspectRatio,
      ...(config.resampling || {}),
    },
    normalization: {
      ...DEFAULT_STROKE_CONFIG.normalization,
      surfaceAspectRatio,
      ...(config.normalization || {}),
    },
    surfaceAspectRatio,
  };

  // Step 1: Deep clone & Sanitize
  const sanitized = sanitizeStrokes(rawStrokes);

  if (sanitized.length === 0) {
    return {
      strokes: [],
      rawStrokes: [],
      inSituStrokes: [],
      strokeCount: 0,
      pointCountRaw: 0,
      pointCountProcessed: 0,
      rawArcLength: 0,
      rawBoundingBox: computeBoundingBox([]),
      boundingBox: computeBoundingBox([]),
      normalizedBoundingBox: computeBoundingBox([]),
      aspectRatio: 1,
      processingDurationMs: Number((performance.now() - t0).toFixed(2)),
      config: mergedConfig,
    };
  }

  const pointCountRaw = sanitized.reduce((acc, s) => acc + s.length, 0);
  const rawArcLength = Number(
    sanitized.reduce((acc, s) => acc + computeStrokeArcLength(s, surfaceAspectRatio), 0).toFixed(5)
  );
  const rawBoundingBox = computeBoundingBox(sanitized);

  // Step 2: Smoothing (noise & jitter reduction)
  let smoothed = sanitized;
  if (mergedConfig.smoothing.enabled) {
    smoothed = smoothStrokes(sanitized, mergedConfig.smoothing);
  }

  // Step 3: Resampling (uniform spatial arc-length spacing)
  let resampled = smoothed;
  if (mergedConfig.resampling.enabled) {
    resampled = resampleStrokes(smoothed, mergedConfig.resampling);
  }

  // Step 4: Aspect-ratio-preserving Normalization
  let normalized = resampled;
  let normMeta = {
    boundingBox: computeBoundingBox(resampled),
    normalizedBoundingBox: computeBoundingBox([]),
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    aspectRatio: 1,
  };

  if (mergedConfig.normalization.enabled) {
    const normResult = normalizeStrokes(resampled, mergedConfig.normalization);
    normalized = normResult.normalizedStrokes;
    normMeta = normResult;
  }

  const pointCountProcessed = normalized.reduce((acc, s) => acc + s.length, 0);
  const bbox = normMeta.boundingBox;
  const aspectRatio = normMeta.aspectRatio !== undefined
    ? normMeta.aspectRatio
    : (bbox.height > 1e-6 ? Number((bbox.width / bbox.height).toFixed(3)) : 1);
  const duration = Number((performance.now() - t0).toFixed(2));

  return {
    strokes: normalized,
    rawStrokes: cloneStrokes(rawStrokes),
    inSituStrokes: cloneStrokes(resampled),
    strokeCount: normalized.length,
    pointCountRaw,
    pointCountProcessed,
    rawArcLength,
    rawBoundingBox,
    boundingBox: bbox,
    normalizedBoundingBox: normMeta.normalizedBoundingBox,
    aspectRatio,
    normalizationMeta: {
      scale: normMeta.scale,
      offsetX: normMeta.offsetX,
      offsetY: normMeta.offsetY,
      surfaceAspectRatio,
    },
    processingDurationMs: duration,
    config: mergedConfig,
  };
}

/**
 * Render comparison between raw and processed strokes onto canvas context.
 * Draws raw strokes in faint slate line, and processed strokes in clean cyan
 * with visible resampled points.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<Array<{x: number, y: number}>>} rawStrokes
 * @param {Array<Array<{x: number, y: number}>>} processedStrokes
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @param {function} mapFn - (normPoint, width, height) => {x, y}
 */
export function renderComparisonStrokes(
  ctx,
  rawStrokes,
  processedStrokes,
  canvasWidth,
  canvasHeight,
  mapFn
) {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // 1. Draw Raw Strokes (muted, faint dashed line)
  if (rawStrokes && rawStrokes.length > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.lineWidth = 2.0;
    ctx.setLineDash([4, 4]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const stroke of rawStrokes) {
      if (!stroke || stroke.length === 0) continue;
      ctx.beginPath();
      const p0 = mapFn(stroke[0], canvasWidth, canvasHeight);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < stroke.length; i++) {
        const pt = mapFn(stroke[i], canvasWidth, canvasHeight);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // 2. Draw Processed Strokes (solid, glowing cyan with resampled vertices)
  if (processedStrokes && processedStrokes.length > 0) {
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4.0;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(56, 189, 248, 0.5)';
    ctx.shadowBlur = 8;

    for (const stroke of processedStrokes) {
      if (!stroke || stroke.length === 0) continue;
      ctx.beginPath();
      const p0 = mapFn(stroke[0], canvasWidth, canvasHeight);
      ctx.moveTo(p0.x, p0.y);

      if (stroke.length === 1) {
        ctx.lineTo(p0.x + 0.1, p0.y);
      } else {
        for (let i = 1; i < stroke.length; i++) {
          const pt = mapFn(stroke[i], canvasWidth, canvasHeight);
          ctx.lineTo(pt.x, pt.y);
        }
      }
      ctx.stroke();

      // Draw resampled point vertices
      ctx.save();
      ctx.fillStyle = '#f8fafc';
      ctx.shadowBlur = 0;
      for (const pt of stroke) {
        const canvasPt = mapFn(pt, canvasWidth, canvasHeight);
        ctx.beginPath();
        ctx.arc(canvasPt.x, canvasPt.y, 2.5, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }
}
