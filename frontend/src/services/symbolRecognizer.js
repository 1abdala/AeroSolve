/**
 * AeroSolve — Milestone M5: Local Symbol Recognition
 * Client-Side In-Browser Symbol Recognition Engine
 *
 * Implements ultra-fast, offline, local recognition for handwritten digits 0–9.
 * Accepts processed strokes from M4 pipeline and returns:
 *   - Top prediction (string: "0"–"9")
 *   - Confidence / similarity score (number: 0.0–1.0)
 *   - Top-3 candidate predictions with individual scores
 *   - All class scores
 *   - Inference latency in milliseconds
 *
 * Supports both model architectures:
 *   - 'feature_classifier_mlp': 76-dimensional geometric feature dense MLP (default)
 *   - 'point_cloud_template': P+ multi-stroke point-cloud template matcher
 */

import { extractStrokeFeatures } from './symbolFeatures';
import { computeStrokeArcLength, computeBoundingBox } from './strokeProcessor';

export const SUPPORTED_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Phase A: Configurable Input Qualification Criteria
 * Rejects accidental dots, contact bounces, and incomplete/tiny gestures.
 */
export const DEFAULT_INPUT_QUALIFICATION = {
  enabled: true,
  minRawPoints: 5,               // Reject if total raw captured points < 5
  minProcessedPoints: 3,         // Reject if processed/resampled points < 3
  minArcLength: 0.035,           // Reject if total trajectory length < 0.035 in camera space
  minBoundingBoxDim: 0.030,      // Reject if max(width, height) < 0.030 in camera space
  minIndividualArcLength: 0.035, // For multi-stroke inputs: at least one stroke must have arcLength >= 0.035
  minIndividualBoundingBoxDim: 0.030, // For multi-stroke inputs: at least one stroke must have max(width, height) >= 0.030
};

/**
 * Phase E: Configurable Confidence Rejection Criteria
 * Prevents forced classification when model confidence is low.
 */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.45;

/**
 * Check if at least one individual stroke in a multi-stroke gesture is substantial.
 * Rejects multi-stroke inputs composed exclusively of insignificant micro-strokes or accidental taps.
 *
 * @param {Array<Array<{x: number, y: number}>>} strokes
 * @param {number} [surfaceAR=1.0]
 * @param {object} [config=DEFAULT_INPUT_QUALIFICATION]
 * @returns {boolean}
 */
export function hasSubstantialStroke(strokes, surfaceAR = 1.0, config = DEFAULT_INPUT_QUALIFICATION) {
  if (!Array.isArray(strokes) || strokes.length === 0) return false;

  const minDim = typeof config.minIndividualBoundingBoxDim === 'number'
    ? config.minIndividualBoundingBoxDim
    : (config.minBoundingBoxDim || 0.030);

  const minLen = typeof config.minIndividualArcLength === 'number'
    ? config.minIndividualArcLength
    : (config.minArcLength || 0.035);

  for (let i = 0; i < strokes.length; i++) {
    const s = strokes[i];
    if (!Array.isArray(s) || s.length < 2) continue;

    const sLen = computeStrokeArcLength(s, surfaceAR);
    const sBbox = computeBoundingBox([s]);
    const sMaxDim = Math.max(sBbox.width || 0, sBbox.height || 0);

    if (sLen >= minLen && sMaxDim >= minDim) {
      return true;
    }
  }

  return false;
}

/**
 * Validate input strokes against minimum geometric criteria to reject dots,
 * tiny jitters, and accidental contact bounces before classification.
 *
 * @param {Array<Array<{x: number, y: number}>>} processedStrokes
 * @param {object} [options={}]
 * @returns {{
 *   isValid: boolean,
 *   reason: string,
 *   message?: string,
 *   metrics?: { rawPoints: number, processedPoints: number, arcLength: number, maxDim: number }
 * }}
 */
export function validateStrokeInput(processedStrokes, options = {}) {
  const config = { ...DEFAULT_INPUT_QUALIFICATION, ...(options.inputQualification || {}) };

  if (!Array.isArray(processedStrokes) || processedStrokes.length === 0) {
    return {
      isValid: false,
      reason: 'EMPTY_STROKES',
      message: 'No strokes available',
      metrics: { rawPoints: 0, processedPoints: 0, arcLength: 0, maxDim: 0 },
    };
  }

  let processedPoints = 0;
  let processedArcLength = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let allCentered = true;

  for (let sIdx = 0; sIdx < processedStrokes.length; sIdx++) {
    const s = processedStrokes[sIdx];
    if (!Array.isArray(s) || s.length === 0) continue;
    processedPoints += s.length;

    for (let pIdx = 0; pIdx < s.length; pIdx++) {
      const p = s[pIdx];
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') continue;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;

      // Check if coordinate is clamped at degenerate center (0.5, 0.5)
      if (Math.abs(p.x - 0.5) > 1e-4 || Math.abs(p.y - 0.5) > 1e-4) {
        allCentered = false;
      }

      if (pIdx > 0) {
        const prev = s[pIdx - 1];
        processedArcLength += Math.hypot(p.x - prev.x, p.y - prev.y);
      }
    }
  }

  // 1. Raw Point Count:
  // Must reflect the actual collected camera-space frames before resampling inflation.
  let rawPoints;
  if (typeof options.pointCountRaw === 'number') {
    rawPoints = options.pointCountRaw;
  } else if (Array.isArray(options.rawStrokes) && options.rawStrokes.length > 0) {
    rawPoints = options.rawStrokes.reduce((acc, s) => acc + (Array.isArray(s) ? s.length : 0), 0);
  } else {
    rawPoints = processedPoints;
  }

  // Degenerate dot detection (e.g. single point or M4 zero-size collapse to 0.5, 0.5)
  if (allCentered || rawPoints <= 1 || processedPoints <= 1) {
    return {
      isValid: false,
      reason: 'DEGENERATE_DOT',
      message: 'Stationary pinch tap or dot detected',
      metrics: { rawPoints, processedPoints, arcLength: 0, maxDim: 0 },
    };
  }

  // 2. Raw Arc Length:
  // Must reflect physical trajectory distance in camera coordinates, NOT M4-normalized [0.05, 0.95] coordinates.
  const surfaceAR = typeof options.surfaceAspectRatio === 'number' && options.surfaceAspectRatio > 0
    ? options.surfaceAspectRatio
    : 1.0;

  let rawArcLength;
  if (typeof options.rawArcLength === 'number') {
    rawArcLength = options.rawArcLength;
  } else if (Array.isArray(options.rawStrokes) && options.rawStrokes.length > 0) {
    rawArcLength = options.rawStrokes.reduce(
      (sum, s) => sum + (Array.isArray(s) ? computeStrokeArcLength(s, surfaceAR) : 0),
      0
    );
  } else {
    rawArcLength = processedArcLength;
  }

  // 3. Raw Bounding Box Dimension:
  // Must reflect camera-space dimensions, NOT normalized coordinates.
  let rawBbox = options.rawBoundingBox || options.boundingBox;
  if (!rawBbox && Array.isArray(options.rawStrokes) && options.rawStrokes.length > 0) {
    rawBbox = computeBoundingBox(options.rawStrokes);
  }

  let maxDim;
  if (rawBbox && typeof rawBbox.width === 'number' && typeof rawBbox.height === 'number') {
    maxDim = Math.max(rawBbox.width, rawBbox.height);
  } else {
    maxDim = Math.max(Math.max(0, maxX - minX), Math.max(0, maxY - minY));
  }

  // Substantial gesture exception:
  // Legitimate large strokes with few keypoints (at least 3) are allowed even if point count is slightly below threshold.
  // Must require rawPoints >= 3 so a 2-point displacement glitch is never qualified.
  const isSubstantialGesture = maxDim >= 0.08 && rawArcLength >= 0.08 && rawPoints >= 3;

  // Check 1: Bounding box size (in camera space)
  if (config.enabled && maxDim < config.minBoundingBoxDim) {
    return {
      isValid: false,
      reason: 'BOUNDING_BOX_TOO_SMALL',
      message: `Bounding box dimension (${maxDim.toFixed(3)}) below threshold (${config.minBoundingBoxDim})`,
      metrics: { rawPoints, processedPoints, arcLength: rawArcLength, maxDim },
    };
  }

  // Check 2: Arc length (in camera space)
  if (config.enabled && rawArcLength < config.minArcLength) {
    return {
      isValid: false,
      reason: 'STROKE_TOO_SHORT',
      message: `Stroke arc length (${rawArcLength.toFixed(3)}) below threshold (${config.minArcLength})`,
      metrics: { rawPoints, processedPoints, arcLength: rawArcLength, maxDim },
    };
  }

  // Check 3: Raw point count (prevents resampling from inflating sparse/teleporting input)
  if (config.enabled && !isSubstantialGesture && rawPoints < config.minRawPoints) {
    return {
      isValid: false,
      reason: 'TOO_FEW_POINTS',
      message: `Only ${rawPoints} raw points captured (minimum: ${config.minRawPoints})`,
      metrics: { rawPoints, processedPoints, arcLength: rawArcLength, maxDim },
    };
  }

  // Check 4: Processed point count
  if (config.enabled && !isSubstantialGesture && processedPoints < config.minProcessedPoints) {
    return {
      isValid: false,
      reason: 'TOO_FEW_POINTS',
      message: `Only ${processedPoints} processed points (minimum: ${config.minProcessedPoints})`,
      metrics: { rawPoints, processedPoints, arcLength: rawArcLength, maxDim },
    };
  }

  // Check 5: Multi-stroke individual substantiality check
  // For multi-stroke gestures, verify that at least one constituent stroke is substantial.
  // Rejects accidental disconnected micro-clicks/taps that span a large aggregate bounding box.
  const strokesToAudit = Array.isArray(options.rawStrokes) && options.rawStrokes.length > 0
    ? options.rawStrokes
    : processedStrokes;
  const validStrokes = strokesToAudit.filter((s) => Array.isArray(s) && s.length > 0);

  if (config.enabled && validStrokes.length > 1) {
    if (!hasSubstantialStroke(validStrokes, surfaceAR, config)) {
      return {
        isValid: false,
        reason: 'DISCONNECTED_MICRO_STROKES',
        message: 'Multi-stroke gesture contains only insignificant disconnected strokes',
        metrics: { rawPoints, processedPoints, arcLength: rawArcLength, maxDim },
      };
    }
  }

  return {
    isValid: true,
    reason: 'QUALIFIED',
    message: 'Valid gesture input',
    metrics: { rawPoints, processedPoints, arcLength: rawArcLength, maxDim },
  };
}

/**
 * Resample multi-stroke point cloud to fixed target count (for template matcher fallback).
 * @param {Array<Array<{x: number, y: number}>>} strokes
 * @param {number} targetPoints
 * @returns {Array<{x: number, y: number, stroke: number}>}
 */
export function resamplePointCloud(strokes, targetPoints = 32) {
  if (!Array.isArray(strokes) || strokes.length === 0) return [];

  const cleanStrokes = [];
  for (let sIdx = 0; sIdx < strokes.length; sIdx++) {
    const s = strokes[sIdx];
    if (!Array.isArray(s) || s.length === 0) continue;
    const pts = [];
    for (let pIdx = 0; pIdx < s.length; pIdx++) {
      const p = s[pIdx];
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        pts.push({ x: p.x, y: p.y });
      }
    }
    if (pts.length > 0) cleanStrokes.push(pts);
  }

  if (cleanStrokes.length === 0) return [];

  let totalLen = 0;
  const strokeLens = [];
  for (let i = 0; i < cleanStrokes.length; i++) {
    const s = cleanStrokes[i];
    let slen = 0;
    for (let j = 0; j < s.length - 1; j++) {
      slen += Math.hypot(s[j + 1].x - s[j].x, s[j + 1].y - s[j].y);
    }
    strokeLens.push(slen);
    totalLen += slen;
  }

  if (totalLen < 1e-6) {
    const p0 = cleanStrokes[0][0];
    return Array.from({ length: targetPoints }, () => ({ x: p0.x, y: p0.y, stroke: 0 }));
  }

  const cloud = [];
  let assignedTotal = 0;

  for (let sIdx = 0; sIdx < cleanStrokes.length; sIdx++) {
    const s = cleanStrokes[sIdx];
    const slen = strokeLens[sIdx];
    let ptsForStroke;

    if (sIdx === cleanStrokes.length - 1) {
      ptsForStroke = targetPoints - assignedTotal;
    } else {
      const fraction = slen / totalLen;
      ptsForStroke = Math.max(2, Math.round(fraction * targetPoints));
      const remStrokes = cleanStrokes.length - 1 - sIdx;
      ptsForStroke = Math.min(ptsForStroke, targetPoints - assignedTotal - remStrokes * 2);
    }
    ptsForStroke = Math.max(2, ptsForStroke);
    assignedTotal += ptsForStroke;

    if (slen < 1e-7 || s.length === 1) {
      const pt = s[0];
      for (let k = 0; k < ptsForStroke; k++) {
        cloud.push({ x: pt.x, y: pt.y, stroke: sIdx });
      }
      continue;
    }

    const step = slen / (ptsForStroke - 1);
    cloud.push({ x: s[0].x, y: s[0].y, stroke: sIdx });

    let accDist = 0;
    let targetDist = step;
    let segIdx = 0;

    while (segIdx < s.length - 1 && cloud.length < assignedTotal) {
      const p1 = s[segIdx];
      const p2 = s[segIdx + 1];
      const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);

      if (segLen < 1e-7) {
        segIdx++;
        continue;
      }

      if (accDist + segLen >= targetDist) {
        const t = (targetDist - accDist) / segLen;
        cloud.push({
          x: p1.x + t * (p2.x - p1.x),
          y: p1.y + t * (p2.y - p1.y),
          stroke: sIdx,
        });
        targetDist += step;
      } else {
        accDist += segLen;
        segIdx++;
      }
    }

    while (cloud.length < assignedTotal) {
      const lastP = s[s.length - 1];
      cloud.push({ x: lastP.x, y: lastP.y, stroke: sIdx });
    }
  }

  return cloud.slice(0, targetPoints);
}

/**
 * Fast bidirectional point cloud distance.
 */
function computeCloudDistance(cloud1, cloud2) {
  const n1 = cloud1.length;
  const n2 = cloud2.length;
  if (n1 === 0 || n2 === 0) return Infinity;

  let d1To2 = 0;
  for (let i = 0; i < n1; i++) {
    const p = cloud1[i];
    let minD = Infinity;
    for (let j = 0; j < n2; j++) {
      const q = cloud2[j];
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < minD) {
        minD = d;
        if (d < 1e-4) break;
      }
    }
    d1To2 += minD;
  }

  let d2To1 = 0;
  for (let j = 0; j < n2; j++) {
    const q = cloud2[j];
    let minD = Infinity;
    for (let i = 0; i < n1; i++) {
      const p = cloud1[i];
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < minD) {
        minD = d;
        if (d < 1e-4) break;
      }
    }
    d2To1 += minD;
  }

  return 0.5 * (d1To2 / n1 + d2To1 / n2);
}

/**
 * In-browser inference implementation for FeatureMLPClassifier.
 * Forward pass: x(76) -> Dense(32, ReLU) -> Dense(10, Softmax).
 * Typically executes in < 0.2 milliseconds.
 */
function predictMLP(model, features) {
  const { inputDim, hiddenDim, numClasses, classes, weights } = model;
  const { w1, b1, w2, b2 } = weights;

  // Layer 1: h = ReLU(W1 * x + b1)
  const h = new Float32Array(hiddenDim);
  for (let j = 0; j < hiddenDim; j++) {
    const row = w1[j];
    let sum = b1[j];
    for (let i = 0; i < inputDim; i++) {
      sum += row[i] * features[i];
    }
    h[j] = sum > 0 ? sum : 0; // ReLU
  }

  // Layer 2: z = W2 * h + b2
  const z = new Float32Array(numClasses);
  let maxZ = -Infinity;
  for (let k = 0; k < numClasses; k++) {
    const row = w2[k];
    let sum = b2[k];
    for (let j = 0; j < hiddenDim; j++) {
      sum += row[j] * h[j];
    }
    z[k] = sum;
    if (sum > maxZ) maxZ = sum;
  }

  // Softmax
  let sumExp = 0;
  const probs = new Float32Array(numClasses);
  for (let k = 0; k < numClasses; k++) {
    const e = Math.exp(z[k] - maxZ);
    probs[k] = e;
    sumExp += e;
  }
  const invSumExp = sumExp > 1e-12 ? 1.0 / sumExp : 1.0;
  for (let k = 0; k < numClasses; k++) {
    probs[k] *= invSumExp;
  }

  // Find top indices
  const indices = Array.from({ length: numClasses }, (_, i) => i);
  indices.sort((a, b) => probs[b] - probs[a]);

  const topIdx = indices[0];
  const topPrediction = classes[topIdx];
  const confidence = Number(probs[topIdx].toFixed(4));

  const candidates = indices.slice(0, 3).map((idx) => ({
    label: classes[idx],
    score: Number(probs[idx].toFixed(4)),
  }));

  const allScores = {};
  for (let k = 0; k < numClasses; k++) {
    allScores[classes[k]] = Number(probs[k].toFixed(4));
  }

  return { topPrediction, confidence, candidates, allScores };
}

/**
 * In-browser inference implementation for PointCloudTemplateRecognizer.
 */
function predictTemplate(model, strokes, strokeCount) {
  const { classes, templates } = model;
  const cloud = resamplePointCloud(strokes, model.num_points || 32);

  const kStrokes = typeof strokeCount === 'number' ? strokeCount : strokes.length;
  const classBestDist = {};
  for (let c = 0; c < classes.length; c++) {
    classBestDist[classes[c]] = Infinity;
  }

  for (let t = 0; t < templates.length; t++) {
    const tmpl = templates[t];
    const rawDist = computeCloudDistance(cloud, tmpl.points);
    const strokePenalty = 0.06 * Math.abs(kStrokes - (tmpl.stroke_count || 1));
    const dist = rawDist + strokePenalty;
    if (dist < classBestDist[tmpl.label]) {
      classBestDist[tmpl.label] = dist;
    }
  }

  const dMax = 0.35;
  const allScores = {};
  for (let c = 0; c < classes.length; c++) {
    const lbl = classes[c];
    const d = classBestDist[lbl];
    const sim = Math.max(0.0, 1.0 - d / dMax);
    allScores[lbl] = Number(sim.toFixed(4));
  }

  const sortedLabels = [...classes].sort((a, b) => allScores[b] - allScores[a]);
  const topPrediction = sortedLabels[0];
  const confidence = allScores[topPrediction];

  const candidates = sortedLabels.slice(0, 3).map((lbl) => ({
    label: lbl,
    score: allScores[lbl],
  }));

  return { topPrediction, confidence, candidates, allScores };
}

/**
 * Main symbol recognition function.
 * Evaluates processed strokes and returns classification results.
 *
 * @param {Array<Array<{x: number, y: number}>>} processedStrokes
 * @param {object} model - Parsed JSON model artifact
 * @param {object} [options={}] - Optional metadata (aspectRatio, strokeCount)
 * @returns {{
 *   topPrediction: string,
 *   confidence: number,
 *   candidates: Array<{label: string, score: number}>,
 *   allScores: Record<string, number>,
 *   durationMs: number,
 *   modelType: string
 * }}
 */
export function predictSymbol(processedStrokes, model, options = {}) {
  const t0 = performance.now();

  // Edge case 1: Empty or missing stroke data or model
  if (!Array.isArray(processedStrokes) || processedStrokes.length === 0 || !model) {
    const fallbackScores = {};
    for (let i = 0; i <= 9; i++) fallbackScores[String(i)] = 0.0;
    return {
      status: 'REJECTED',
      rejectionReason: !model ? 'NO_MODEL' : 'EMPTY_STROKES',
      rejectionMessage: !model ? 'Model not loaded' : 'No strokes drawn',
      topPrediction: '0',
      confidence: 0.0,
      isConfident: false,
      candidates: [
        { label: '0', score: 0.0 },
        { label: '1', score: 0.0 },
        { label: '2', score: 0.0 },
      ],
      allScores: fallbackScores,
      durationMs: Number((performance.now() - t0).toFixed(2)),
      modelType: model?.modelType || model?.model_type || 'unknown',
    };
  }

  // Phase A: Input Qualification Gate (reject dots, micro-strokes, contact bounces)
  const qualification = validateStrokeInput(processedStrokes, options);
  if (!qualification.isValid) {
    const fallbackScores = {};
    for (let i = 0; i <= 9; i++) fallbackScores[String(i)] = 0.0;
    return {
      status: 'REJECTED',
      rejectionReason: qualification.reason,
      rejectionMessage: qualification.message,
      metrics: qualification.metrics,
      topPrediction: null,
      confidence: 0.0,
      isConfident: false,
      candidates: [
        { label: '0', score: 0.0 },
        { label: '1', score: 0.0 },
        { label: '2', score: 0.0 },
      ],
      allScores: fallbackScores,
      durationMs: Number((performance.now() - t0).toFixed(2)),
      modelType: model?.modelType || model?.model_type || 'unknown',
    };
  }

  const modelType = model.modelType || model.model_type;
  let prediction;

  if (modelType === 'feature_classifier_mlp') {
    const features = extractStrokeFeatures(
      processedStrokes,
      options.aspectRatio,
      options.strokeCount
    );
    prediction = predictMLP(model, features);
  } else if (modelType === 'point_cloud_template') {
    prediction = predictTemplate(model, processedStrokes, options.strokeCount);
  } else {
    // If unknown model structure, assume feature_classifier_mlp if weights exists
    if (model.weights) {
      const features = extractStrokeFeatures(
        processedStrokes,
        options.aspectRatio,
        options.strokeCount
      );
      prediction = predictMLP(model, features);
    } else {
      throw new Error(`Unsupported symbol recognition model type: ${modelType}`);
    }
  }

  const durationMs = Number((performance.now() - t0).toFixed(2));

  // Phase E: Configurable Confidence Rejection Mechanism
  const minConfidence = typeof options.minConfidence === 'number'
    ? options.minConfidence
    : DEFAULT_CONFIDENCE_THRESHOLD;
  const isConfident = prediction.confidence >= minConfidence;
  const status = isConfident ? 'ACCEPTED' : 'UNCERTAIN';
  const rejectionReason = isConfident ? null : 'LOW_CONFIDENCE';
  const rejectionMessage = isConfident
    ? null
    : `Confidence (${(prediction.confidence * 100).toFixed(1)}%) is below threshold (${(minConfidence * 100).toFixed(1)}%)`;

  return {
    ...prediction,
    status,
    isConfident,
    rejectionReason,
    rejectionMessage,
    durationMs,
    modelType: modelType || 'feature_classifier_mlp',
  };
}
