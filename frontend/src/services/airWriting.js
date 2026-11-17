/**
 * Air-Writing Mathematics Learning: Pinch Detection & Stroke Management
 * Implements hysteresis-based pinch gesture detection and normalized stroke storage.
 */

export const THUMB_TIP_INDEX = 4;
export const INDEX_FINGER_TIP_INDEX = 8;

// Hysteresis thresholds in MediaPipe normalized coordinate space
export const PINCH_START_THRESHOLD = 0.065;
export const PINCH_RELEASE_THRESHOLD = 0.085;

// Minimum normalized distance between consecutive stroke points to avoid redundant points
export const MIN_POINT_DISTANCE = 0.003;

/**
 * Calculate Euclidean distance between two landmarks.
 * Works with 2D or 3D normalized coordinates.
 * @param {{x: number, y: number, z?: number}} p1
 * @param {{x: number, y: number, z?: number}} p2
 * @returns {number}
 */
export function calculateLandmarkDistance(p1, p2) {
  if (!p1 || !p2) return Infinity;

  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = (p1.z !== undefined && p2.z !== undefined) ? p1.z - p2.z : 0;

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Determine pinch state using hysteresis to prevent rapid on/off switching.
 * @param {boolean} currentPinchState - Current active pinch state
 * @param {number} distance - Normalized distance between thumb tip and index tip
 * @param {number} startThreshold - Threshold below which pinch activates
 * @param {number} releaseThreshold - Threshold above which pinch deactivates
 * @returns {boolean} Next pinch state
 */
export function updatePinchHysteresis(
  currentPinchState,
  distance,
  startThreshold = PINCH_START_THRESHOLD,
  releaseThreshold = PINCH_RELEASE_THRESHOLD
) {
  if (currentPinchState) {
    // Already pinching: only release if distance exceeds releaseThreshold
    return distance < releaseThreshold;
  }
  // Not pinching: only activate if distance falls below startThreshold
  return distance <= startThreshold;
}

/**
 * Map normalized point (0..1) to mirrored canvas pixel coordinates.
 * @param {{x: number, y: number}} normPoint
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @returns {{x: number, y: number}}
 */
export function mapNormalizedToCanvas(normPoint, canvasWidth, canvasHeight) {
  return {
    x: (1 - normPoint.x) * canvasWidth,
    y: normPoint.y * canvasHeight,
  };
}

/**
 * Redraw an array of strokes onto a 2D canvas context.
 * Used on canvas resize or manual refresh.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<Array<{x: number, y: number}>>} strokes - Array of strokes with normalized coordinates
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @param {object} options
 */
export function renderStrokesToCanvas(
  ctx,
  strokes,
  canvasWidth,
  canvasHeight,
  options = {}
) {
  const {
    strokeStyle = '#38bdf8',
    lineWidth = 4,
    shadowColor = 'rgba(56, 189, 248, 0.4)',
    shadowBlur = 6,
  } = options;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  if (!strokes || strokes.length === 0) return;

  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = shadowColor;
  ctx.shadowBlur = shadowBlur;

  for (const stroke of strokes) {
    if (!stroke || stroke.length === 0) continue;

    ctx.beginPath();
    const firstPt = mapNormalizedToCanvas(stroke[0], canvasWidth, canvasHeight);
    ctx.moveTo(firstPt.x, firstPt.y);

    if (stroke.length === 1) {
      // Single-point tap: draw a tiny line dot
      ctx.lineTo(firstPt.x + 0.1, firstPt.y);
    } else {
      for (let i = 1; i < stroke.length; i++) {
        const pt = mapNormalizedToCanvas(stroke[i], canvasWidth, canvasHeight);
        ctx.lineTo(pt.x, pt.y);
      }
    }
    ctx.stroke();
  }

  ctx.restore();
}
