/**
 * Air-Writing Mathematics Learning: Pinch Detection & Stroke Management
 * Implements hysteresis-based pinch gesture detection and normalized stroke storage.
 */

export const THUMB_TIP_INDEX = 4;
export const INDEX_FINGER_TIP_INDEX = 8;

// Hysteresis thresholds in MediaPipe normalized coordinate space
export const PINCH_START_THRESHOLD = 0.065;
export const PINCH_RELEASE_THRESHOLD = 0.085;
// Immediate release threshold: deliberate finger separation (>= 0.105) terminates drawing without debounce
export const PINCH_RELEASE_IMMEDIATE_THRESHOLD = 0.105;

// Minimum normalized distance between consecutive stroke points to avoid redundant points
export const MIN_POINT_DISTANCE = 0.003;

// Dropout tolerance: maximum consecutive missed frames and time window (ms) to bridge
// brief MediaPipe detection dropouts (e.g., finger occlusion during pinch or motion blur)
export const MAX_DROPOUT_GRACE_FRAMES = 4;
export const MAX_DROPOUT_GRACE_MS = 150;

// Safe stroke resumption limits across brief tracking dropouts
export const MAX_RESUME_GAP_MS = 200;
export const MAX_RESUME_GAP_DISTANCE = 0.20;

// Pinch release debounce: consecutive frames required in tolerance band [0.085, 0.105) before ending stroke
export const PINCH_RELEASE_DEBOUNCE_FRAMES = 2;

/**
 * Determine if a tracking failure should be treated as a brief dropout (grace period)
 * rather than a genuine tracking loss.
 * @param {number} missedFrames - Consecutive video frames with no hand detected
 * @param {number} elapsedMs - Time in milliseconds since last confirmed detection
 * @param {number} maxGraceFrames
 * @param {number} maxGraceMs
 * @returns {boolean}
 */
export function isTrackingInGracePeriod(
  missedFrames,
  elapsedMs,
  maxGraceFrames = MAX_DROPOUT_GRACE_FRAMES,
  maxGraceMs = MAX_DROPOUT_GRACE_MS
) {
  return missedFrames > 0 && missedFrames <= maxGraceFrames && elapsedMs <= maxGraceMs;
}

/**
 * Determine if tracking is genuinely lost (exceeded dropout grace thresholds).
 * @param {number} missedFrames
 * @param {number} elapsedMs
 * @param {number} maxGraceFrames
 * @param {number} maxGraceMs
 * @returns {boolean}
 */
export function isTrackingGenuinelyLost(
  missedFrames,
  elapsedMs,
  maxGraceFrames = MAX_DROPOUT_GRACE_FRAMES,
  maxGraceMs = MAX_DROPOUT_GRACE_MS
) {
  return missedFrames > maxGraceFrames || elapsedMs > maxGraceMs;
}

/**
 * Evaluate whether an active stroke interrupted by a brief tracking gap can safely resume
 * without creating a spurious or disjointed connection.
 * @param {{x: number, y: number}|null} lastPoint - Last confirmed stroke point before gap
 * @param {{x: number, y: number}|null} newPoint - Newly re-acquired fingertip position
 * @param {number} elapsedMs - Time elapsed since the interruption began
 * @param {number} maxGapDist - Maximum allowed spatial distance for continuity
 * @param {number} maxGapMs - Maximum allowed temporal duration for continuity
 * @returns {{ canResume: boolean, distance: number, reason: string }}
 */
export function canResumeSuspendedStroke(
  lastPoint,
  newPoint,
  elapsedMs,
  maxGapDist = MAX_RESUME_GAP_DISTANCE,
  maxGapMs = MAX_RESUME_GAP_MS
) {
  if (!lastPoint || !newPoint) {
    return { canResume: false, distance: Infinity, reason: 'Missing point coordinates' };
  }

  const distance = Math.hypot(newPoint.x - lastPoint.x, newPoint.y - lastPoint.y);

  if (elapsedMs > maxGapMs) {
    return {
      canResume: false,
      distance,
      reason: `Elapsed gap time ${Math.round(elapsedMs)}ms exceeds limit (${maxGapMs}ms)`,
    };
  }

  if (distance > maxGapDist) {
    return {
      canResume: false,
      distance,
      reason: `Spatial gap distance ${distance.toFixed(3)} exceeds limit (${maxGapDist})`,
    };
  }

  return {
    canResume: true,
    distance,
    reason: `Safe resumption: ${Math.round(elapsedMs)}ms gap, distance ${distance.toFixed(3)} <= ${maxGapDist}`,
  };
}

/**
 * Validate index fingertip landmark stability relative to the hand skeleton.
 * Distinguishes true hand detection loss from local fingertip instability / jitter.
 * @param {Array<{x: number, y: number, z?: number}>|null} landmarks - 21 hand landmarks
 * @param {{x: number, y: number}|null} prevIndexTip - Previous index fingertip
 * @param {number} dtSec - Time delta in seconds
 * @returns {{ isStable: boolean, reason: string }}
 */
export function validateFingertipStability(landmarks, prevIndexTip = null, dtSec = 0.033) {
  if (!landmarks || landmarks.length < 21) {
    return { isStable: false, reason: 'Hand landmarks missing or incomplete (< 21)' };
  }

  const indexTip = landmarks[INDEX_FINGER_TIP_INDEX];
  const indexMcp = landmarks[5];
  const wrist = landmarks[0];

  if (!indexTip || !Number.isFinite(indexTip.x) || !Number.isFinite(indexTip.y)) {
    return { isStable: false, reason: 'Index fingertip has non-finite coordinates' };
  }

  // 1. Check anatomical scale: finger length vs multi-axis palm scale (rotation-invariant)
  // Measuring both length (wrist #0 to middle MCP #9) and width (index MCP #5 to pinky MCP #17)
  // prevents false instability flags when the hand is tilted or foreshortened at unusual angles.
  const middleMcp = landmarks[9] || indexMcp;
  const pinkyMcp = landmarks[17] || indexMcp;

  const palmLength = Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y);
  const palmWidth = Math.hypot(pinkyMcp.x - indexMcp.x, pinkyMcp.y - indexMcp.y);
  const palmAxis = Math.hypot(indexMcp.x - wrist.x, indexMcp.y - wrist.y);
  const palmScale = Math.max(palmAxis, palmLength, palmWidth);
  const fingerDist = Math.hypot(indexTip.x - indexMcp.x, indexTip.y - indexMcp.y);

  if (palmScale > 0.03 && fingerDist > palmScale * 4.5) {
    return {
      isStable: false,
      reason: `Finger length anomalous: ${fingerDist.toFixed(3)} vs palm ${palmScale.toFixed(3)}`,
    };
  }

  // 2. Check for sudden teleportation / jump (> 0.22 normalized units in a single frame, scaled by dt)
  if (prevIndexTip) {
    const jumpDist = Math.hypot(indexTip.x - prevIndexTip.x, indexTip.y - prevIndexTip.y);
    const maxJump = Math.max(0.22, (dtSec || 0.033) * 4.5);
    if (jumpDist > maxJump) {
      return {
        isStable: false,
        reason: `Index fingertip teleported: jump ${jumpDist.toFixed(3)} > ${maxJump.toFixed(3)}`,
      };
    }
  }

  return { isStable: true, reason: 'Stable' };
}

/**
 * Evaluate whether critical hand landmarks are near or crossing the camera image boundaries [0, 1] x [0, 1].
 * Monocular neural networks (MediaPipe HandLandmarker) suffer from orientation collapse and keypoint swapping
 * when key anchor landmarks (especially the wrist #0 or index tip #8) exit the camera sensor frame.
 *
 * @param {Array<{x: number, y: number, z?: number}>|null} landmarks - 21 hand landmarks
 * @param {number} margin - Safety margin from frame border in normalized units (default: 0.05 = 5%)
 * @returns {{
 *   isNearEdge: boolean,
 *   isWristClipped: boolean,
 *   minMargin: number,
 *   clippedLandmarks: string[],
 *   boundaryWarning: string | null
 * }}
 */
export function checkHandBoundaryProximity(landmarks, margin = 0.05) {
  if (!landmarks || landmarks.length < 21) {
    return {
      isNearEdge: false,
      isWristClipped: false,
      minMargin: 0,
      clippedLandmarks: [],
      boundaryWarning: null,
    };
  }

  const wrist = landmarks[0];
  const thumbTip = landmarks[THUMB_TIP_INDEX];
  const indexTip = landmarks[INDEX_FINGER_TIP_INDEX];
  const pinkyMcp = landmarks[17];

  const critical = [
    { name: 'Index Tip (8)', lm: indexTip },
    { name: 'Thumb Tip (4)', lm: thumbTip },
    { name: 'Wrist (0)', lm: wrist },
    { name: 'Pinky MCP (17)', lm: pinkyMcp },
  ];

  let minMargin = 1.0;
  const clippedLandmarks = [];
  let isWristClipped = false;

  for (const item of critical) {
    if (!item.lm || !Number.isFinite(item.lm.x) || !Number.isFinite(item.lm.y)) continue;
    const { x, y } = item.lm;

    // Distance to nearest edge in normalized [0, 1] space
    const distLeft = x;
    const distRight = 1 - x;
    const distTop = y;
    const distBottom = 1 - y;

    const pointMin = Math.min(distLeft, distRight, distTop, distBottom);
    if (pointMin < minMargin) {
      minMargin = pointMin;
    }

    if (x < margin || x > 1 - margin || y < margin || y > 1 - margin) {
      clippedLandmarks.push(item.name);
    }

    if (item.name.startsWith('Wrist') && (x < 0.02 || x > 0.98 || y < 0.02 || y > 0.98)) {
      isWristClipped = true;
    }
  }

  const isNearEdge = minMargin < margin;
  let boundaryWarning = null;
  if (isWristClipped) {
    boundaryWarning = 'Wrist clipped by camera boundary (MediaPipe orientation unstable)';
  } else if (isNearEdge) {
    boundaryWarning = `Hand near frame edge (margin: ${(minMargin * 100).toFixed(1)}% < ${(margin * 100).toFixed(0)}%)`;
  }

  return {
    isNearEdge,
    isWristClipped,
    minMargin: Number(minMargin.toFixed(4)),
    clippedLandmarks,
    boundaryWarning,
  };
}

/**
 * Calculate 2D pinch distance between thumb tip and index fingertip in the camera projection plane.
 * Monocular z-depth is perspective-dependent and noisy, causing false releases at hand angles.
 * In the camera's image plane, thumb and index pads are in direct contact when pinching regardless of hand tilt.
 * @param {{x: number, y: number}} thumbTip
 * @param {{x: number, y: number}} indexTip
 * @returns {number}
 */
export function calculatePinchDistance(thumbTip, indexTip) {
  if (!thumbTip || !indexTip) return Infinity;
  return Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
}

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
 * Calculate effective pinch distance taking into account both filtered and raw distances.
 * - During active pinch in fast motion: if raw tips confirm contact (<= startThreshold),
 *   use the smaller value to prevent filter phase lag from prematurely releasing.
 * - During deliberate wide finger separation: if raw tips confirm separation (>= immediateReleaseThreshold),
 *   use the larger value (or raw) so filter smoothing lag does not delay intentional release.
 * - In the intermediate band (startThreshold < raw < immediateReleaseThreshold):
 *   use the smaller/smoothed value to protect active continuous writing from transient raw noise spikes.
 * @param {number|null} smoothedDistance
 * @param {number|null} rawDistance
 * @param {number} startThreshold
 * @param {number} immediateReleaseThreshold
 * @returns {number}
 */
export function calculateEffectivePinchDistance(
  smoothedDistance,
  rawDistance,
  startThreshold = PINCH_START_THRESHOLD,
  immediateReleaseThreshold = PINCH_RELEASE_IMMEDIATE_THRESHOLD,
  releaseThreshold = PINCH_RELEASE_THRESHOLD
) {
  const hasSmooth = smoothedDistance !== null && smoothedDistance !== undefined && Number.isFinite(smoothedDistance);
  const hasRaw = rawDistance !== null && rawDistance !== undefined && Number.isFinite(rawDistance);

  if (!hasSmooth && !hasRaw) return Infinity;
  if (!hasSmooth) return rawDistance;
  if (!hasRaw) return smoothedDistance;

  // Active contact confirmed in raw camera sensor: prevent filter phase lag false release
  if (rawDistance <= startThreshold) {
    return Math.min(smoothedDistance, rawDistance);
  }

  // Deliberate wide separation confirmed in raw camera sensor:
  // If raw shows wide separation (>= immediateReleaseThreshold) AND smoothed confirms separation
  // (> startThreshold), release immediately without filter lag.
  // BUT if smoothed is still in confirmed contact (<= startThreshold), an isolated raw jump
  // is a transient sensor noise spike (e.g. occlusion/lighting); clamp to release threshold
  // so debounce protects active drawing from false instant termination.
  if (rawDistance >= immediateReleaseThreshold) {
    if (smoothedDistance > startThreshold) {
      return Math.max(smoothedDistance, rawDistance);
    }
    return releaseThreshold;
  }

  // Intermediate band [startThreshold, immediateReleaseThreshold):
  // Protects active writing curves and direction reversals from transient raw noise spikes
  return Math.min(smoothedDistance, rawDistance);
}

/**
 * Evaluate pinch gesture state transition, debounce, and point addition authorization.
 * Accurately stops stroke creation immediately when fingers separate, preventing unwanted trailing lines.
 *
 * @param {boolean} currentPinchState - Current active pinch state
 * @param {number|null} smoothedDistance - Filtered pinch distance
 * @param {number|null} rawDistance - Unfiltered 2D pinch distance from current frame
 * @param {number} unpinchedFrames - Consecutive frames observed in release tolerance band
 * @param {object} options - Thresholds and debounce configuration
 * @returns {{
 *   isPinching: boolean,
 *   isDebouncing: boolean,
 *   shouldAddPoint: boolean,
 *   effectiveDistance: number,
 *   unpinchedFrames: number,
 *   reason: string
 * }}
 */
export function evaluatePinchGesture(
  currentPinchState,
  smoothedDistance,
  rawDistance,
  unpinchedFrames = 0,
  options = {}
) {
  const {
    startThreshold = PINCH_START_THRESHOLD,
    releaseThreshold = PINCH_RELEASE_THRESHOLD,
    immediateReleaseThreshold = PINCH_RELEASE_IMMEDIATE_THRESHOLD,
    debounceFrames = PINCH_RELEASE_DEBOUNCE_FRAMES,
  } = options;

  const effectiveDistance = calculateEffectivePinchDistance(
    smoothedDistance,
    rawDistance,
    startThreshold,
    immediateReleaseThreshold,
    releaseThreshold
  );

  // 1. Not currently pinching: check for pinch activation
  if (!currentPinchState) {
    const isPinching = effectiveDistance <= startThreshold;
    return {
      isPinching,
      isDebouncing: false,
      shouldAddPoint: isPinching,
      effectiveDistance,
      unpinchedFrames: 0,
      reason: isPinching
        ? `Pinch start: dist ${effectiveDistance.toFixed(3)} <= ${startThreshold}`
        : `Ready: dist ${effectiveDistance.toFixed(3)} > ${startThreshold}`,
    };
  }

  // 2. Currently pinching: check if still within active pinch hold threshold
  if (effectiveDistance < releaseThreshold) {
    return {
      isPinching: true,
      isDebouncing: false,
      shouldAddPoint: true,
      effectiveDistance,
      unpinchedFrames: 0,
      reason: `Pinch active: dist ${effectiveDistance.toFixed(3)} < ${releaseThreshold}`,
    };
  }

  // 3. Deliberate finger separation (>= immediateReleaseThreshold): release immediately on current frame!
  if (effectiveDistance >= immediateReleaseThreshold) {
    return {
      isPinching: false,
      isDebouncing: false,
      shouldAddPoint: false,
      effectiveDistance,
      unpinchedFrames: 0,
      reason: `Immediate pinch release: dist ${effectiveDistance.toFixed(3)} >= ${immediateReleaseThreshold}`,
    };
  }

  // 4. In tolerance band [releaseThreshold, immediateReleaseThreshold):
  // Tolerate micro-fluctuations for up to debounceFrames without splitting active stroke,
  // but DO NOT add new points while in debounce to prevent unwanted trailing lines if releasing.
  if (unpinchedFrames < debounceFrames) {
    return {
      isPinching: true,
      isDebouncing: true,
      shouldAddPoint: false,
      effectiveDistance,
      unpinchedFrames: unpinchedFrames + 1,
      reason: `Pinch release debounce: dist ${effectiveDistance.toFixed(3)} [frame ${unpinchedFrames + 1}/${debounceFrames}]`,
    };
  }

  // 5. Debounce window elapsed: clean release
  return {
    isPinching: false,
    isDebouncing: false,
    shouldAddPoint: false,
    effectiveDistance,
    unpinchedFrames: 0,
    reason: `Pinch released: dist ${effectiveDistance.toFixed(3)} >= ${releaseThreshold}`,
  };
}

/**
 * Map visual normalized point (0..1) to canvas pixel coordinates.
 * Coordinates are stored in visual writing frame where x=0 is left, x=1 is right.
 * @param {{x: number, y: number}} normPoint
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @returns {{x: number, y: number}}
 */
export function mapNormalizedToCanvas(normPoint, canvasWidth, canvasHeight) {
  return {
    x: normPoint.x * canvasWidth,
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
