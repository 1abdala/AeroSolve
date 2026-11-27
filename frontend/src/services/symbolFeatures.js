/**
 * AeroSolve — Milestone M5: Local Symbol Recognition
 * Canonical 76-Dimensional Feature Extraction Module (JavaScript)
 *
 * Strict mathematical parity with backend/app/ml/features.py
 *
 * Shared feature schema:
 *   - Features 0–63 (64 dims): 8x8 Spatial Grid Density Zoning
 *   - Features 64–71 (8 dims):  8-Bin Directional Orientation Histogram
 *   - Feature 72    (1 dim):   Normalized Aspect Ratio (W / H clamped to 2.0 / 2.0)
 *   - Feature 73    (1 dim):   Normalized Stroke Count (min(K, 3) / 3.0)
 *   - Feature 74    (1 dim):   Normalized Total Arc-Length (clamp(L, 0, 3.0) / 3.0)
 *   - Feature 75    (1 dim):   Normalized First-to-Last Endpoint Distance (D_endpoints / (L + 1e-4))
 */

export const FEATURE_VECTOR_SIZE = 76;
export const GRID_SIZE = 8;
export const NUM_DIRECTION_BINS = 8;

/**
 * Extract a normalized 76-dimensional feature vector from processed strokes.
 * Strokes must be in unit coordinate space [0, 1] x [0, 1].
 *
 * @param {Array<Array<{x: number, y: number}>>} strokes
 * @param {number|null} [aspectRatio=null]
 * @param {number|null} [strokeCount=null]
 * @returns {Array<number>} 76-dimensional vector of floats
 */
export function extractStrokeFeatures(strokes, aspectRatio = null, strokeCount = null) {
  const features = new Array(FEATURE_VECTOR_SIZE).fill(0.0);

  if (!Array.isArray(strokes) || strokes.length === 0) {
    return features;
  }

  // Filter non-empty strokes with valid finite coordinates
  const validStrokes = [];
  let totalPoints = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let s = 0; s < strokes.length; s++) {
    const stroke = strokes[s];
    if (!Array.isArray(stroke) || stroke.length === 0) continue;

    const validPts = [];
    for (let p = 0; p < stroke.length; p++) {
      const pt = stroke[p];
      if (
        pt &&
        typeof pt.x === 'number' &&
        typeof pt.y === 'number' &&
        Number.isFinite(pt.x) &&
        Number.isFinite(pt.y)
      ) {
        validPts.push({ x: pt.x, y: pt.y });
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      }
    }

    if (validPts.length > 0) {
      validStrokes.push(validPts);
      totalPoints += validPts.length;
    }
  }

  if (validStrokes.length === 0 || totalPoints === 0) {
    return features;
  }

  // 1. 8x8 Spatial Grid Density (64 features: indices 0..63)
  const gridCells = new Array(GRID_SIZE * GRID_SIZE).fill(0.0);
  let totalGridWeight = 0.0;
  let totalArcLength = 0.0;

  // 2. 8-Bin Directional Orientation Histogram (8 features: indices 64..71)
  const dirBins = new Array(NUM_DIRECTION_BINS).fill(0.0);
  let totalDirWeight = 0.0;

  const stepSize = 0.02;

  for (let s = 0; s < validStrokes.length; s++) {
    const stroke = validStrokes[s];
    const nPts = stroke.length;

    if (nPts === 1) {
      // Single-point dot
      const pt0 = stroke[0];
      const col = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(pt0.x * GRID_SIZE)));
      const row = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(pt0.y * GRID_SIZE)));
      gridCells[row * GRID_SIZE + col] += 1.0;
      totalGridWeight += 1.0;
      continue;
    }

    for (let i = 0; i < nPts - 1; i++) {
      const p1 = stroke[i];
      const p2 = stroke[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const segLen = Math.hypot(dx, dy);

      totalArcLength += segLen;

      if (segLen > 1e-7) {
        // Accumulate directional histogram (weighted by segment length)
        const angle = Math.atan2(dy, dx); // in [-pi, pi]
        const normAngle = ((angle + Math.PI) / (2.0 * Math.PI)) * NUM_DIRECTION_BINS;
        const binIdx = Math.min(NUM_DIRECTION_BINS - 1, Math.max(0, Math.floor(normAngle)));
        dirBins[binIdx] += segLen;
        totalDirWeight += segLen;

        // Discretize segment for grid cell density
        const nSub = Math.max(1, Math.ceil(segLen / stepSize));
        const subW = segLen / nSub;
        for (let sub = 0; sub < nSub; sub++) {
          const t = (sub + 0.5) / nSub;
          const sx = p1.x + t * dx;
          const sy = p1.y + t * dy;
          const col = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(sx * GRID_SIZE)));
          const row = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(sy * GRID_SIZE)));
          gridCells[row * GRID_SIZE + col] += subW;
          totalGridWeight += subW;
        }
      } else {
        const col = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(p1.x * GRID_SIZE)));
        const row = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(p1.y * GRID_SIZE)));
        gridCells[row * GRID_SIZE + col] += 1e-5;
        totalGridWeight += 1e-5;
      }
    }
  }

  // Normalize grid density to sum to 1.0
  if (totalGridWeight > 1e-6) {
    for (let idx = 0; idx < gridCells.length; idx++) {
      features[idx] = Number((gridCells[idx] / totalGridWeight).toFixed(6));
    }
  }

  // Normalize directional histogram to sum to 1.0
  if (totalDirWeight > 1e-6) {
    for (let b = 0; b < NUM_DIRECTION_BINS; b++) {
      features[64 + b] = Number((dirBins[b] / totalDirWeight).toFixed(6));
    }
  }

  // 3. Normalized Aspect Ratio (Feature 72)
  let ar;
  if (typeof aspectRatio === 'number' && Number.isFinite(aspectRatio)) {
    ar = aspectRatio;
  } else {
    const width = Math.max(0.0, maxX - minX);
    const height = Math.max(0.0, maxY - minY);
    ar = height > 1e-5 ? width / height : 1.0;
  }
  features[72] = Number((Math.min(Math.max(ar, 0.0), 2.0) / 2.0).toFixed(6));

  // 4. Normalized Stroke Count (Feature 73)
  const k = typeof strokeCount === 'number' && Number.isFinite(strokeCount) ? strokeCount : validStrokes.length;
  features[73] = Number((Math.min(Math.max(k, 1), 3) / 3.0).toFixed(6));

  // 5. Normalized Total Arc-Length (Feature 74)
  features[74] = Number((Math.min(Math.max(totalArcLength, 0.0), 3.0) / 3.0).toFixed(6));

  // 6. Normalized First-to-Last Endpoint Distance (Feature 75)
  const firstPt = validStrokes[0][0];
  const lastPt = validStrokes[validStrokes.length - 1][validStrokes[validStrokes.length - 1].length - 1];
  const epDist = Math.hypot(lastPt.x - firstPt.x, lastPt.y - firstPt.y);
  const normEp = epDist / (totalArcLength + 1e-4);
  features[75] = Number((Math.min(Math.max(normEp, 0.0), 1.0)).toFixed(6));

  return features;
}
