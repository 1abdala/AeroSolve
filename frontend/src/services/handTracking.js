import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

/**
 * HandLandmarker Service
 * Manages the MediaPipe Hand Landmarker singleton, WASM loader, model initialization,
 * and video frame detection.
 */

// Model asset paths: Local asset with CDN fallback
const LOCAL_MODEL_PATH = '/models/hand_landmarker.task';
const CDN_MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// WASM paths: Local public directory with jsdelivr fallback
const LOCAL_WASM_PATH = '/wasm';
const CDN_WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm';

// Landmark indices
export const THUMB_TIP_INDEX = 4;
export const INDEX_FINGER_TIP_INDEX = 8;

// Landmark connections for the hand skeleton (pairs of landmark indices)
export const HAND_CONNECTIONS = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index finger
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle finger
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring finger
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm base
  [5, 9], [9, 13], [13, 17],
];

let handLandmarkerInstance = null;
let initPromise = null;

/**
 * Initialize MediaPipe FilesetResolver and HandLandmarker with fallback mechanisms.
 * @returns {Promise<HandLandmarker>}
 */
export async function getHandLandmarker() {
  if (handLandmarkerInstance) {
    return handLandmarkerInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    let vision = null;

    // 1. Try resolving vision tasks from local WASM, fallback to CDN
    try {
      vision = await FilesetResolver.forVisionTasks(LOCAL_WASM_PATH);
    } catch (localWasmErr) {
      console.warn('Local WASM loading failed, falling back to CDN:', localWasmErr);
      vision = await FilesetResolver.forVisionTasks(CDN_WASM_PATH);
    }

    // 2. Initialize HandLandmarker (try GPU first, fallback to CPU)
    const createLandmarker = async (modelPath, delegate) => {
      return await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate,
        },
        runningMode: 'VIDEO',
        numHands: 1, // Single-hand detection for Milestone 2
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    };

    try {
      // Attempt 1: Local model with GPU delegate
      try {
        handLandmarkerInstance = await createLandmarker(LOCAL_MODEL_PATH, 'GPU');
      } catch (gpuErr) {
        console.warn('Local GPU initialization failed, attempting CPU delegate:', gpuErr);
        // Attempt 2: Local model with CPU delegate
        handLandmarkerInstance = await createLandmarker(LOCAL_MODEL_PATH, 'CPU');
      }
    } catch (localModelErr) {
      console.warn('Local model loading failed, falling back to remote CDN model:', localModelErr);
      try {
        // Attempt 3: CDN model with GPU delegate
        handLandmarkerInstance = await createLandmarker(CDN_MODEL_PATH, 'GPU');
      } catch (cdnGpuErr) {
        console.warn('CDN GPU initialization failed, attempting CDN CPU delegate:', cdnGpuErr);
        // Attempt 4: CDN model with CPU delegate
        handLandmarkerInstance = await createLandmarker(CDN_MODEL_PATH, 'CPU');
      }
    }

    return handLandmarkerInstance;
  })();

  try {
    const instance = await initPromise;
    return instance;
  } finally {
    initPromise = null;
  }
}

/**
 * Detect hand landmarks in a video frame.
 * @param {HTMLVideoElement} videoElement
 * @param {number} timestampMs
 * @returns {object|null} { landmarks, handedness, indexFingertip }
 */
export function detectHandInVideo(videoElement, timestampMs) {
  if (!handLandmarkerInstance || !videoElement || videoElement.readyState < 2) {
    return null;
  }

  try {
    const results = handLandmarkerInstance.detectForVideo(videoElement, timestampMs);

    if (
      results &&
      results.landmarks &&
      results.landmarks.length > 0 &&
      results.landmarks[0].length >= 21
    ) {
      const landmarks = results.landmarks[0];
      const indexFingertip = landmarks[INDEX_FINGER_TIP_INDEX];
      const thumbTip = landmarks[THUMB_TIP_INDEX];
      
      let handednessLabel = 'Hand';
      let handednessScore = null;
      if (results.handednesses && results.handednesses.length > 0 && results.handednesses[0].length > 0) {
        handednessLabel = results.handednesses[0][0].displayName || results.handednesses[0][0].categoryName;
        handednessScore = results.handednesses[0][0].score;
      }

      return {
        detected: true,
        landmarks,
        indexFingertip,
        thumbTip,
        handedness: handednessLabel,
        confidence: handednessScore,
        rawResults: results,
      };
    }

    return {
      detected: false,
      landmarks: null,
      indexFingertip: null,
      thumbTip: null,
      handedness: null,
      confidence: null,
    };
  } catch (detectErr) {
    console.error('Hand landmark detection error:', detectErr);
    return null;
  }
}

/**
 * Release MediaPipe resources and clean up memory.
 */
export function disposeHandLandmarker() {
  if (handLandmarkerInstance) {
    try {
      handLandmarkerInstance.close();
    } catch (e) {
      console.warn('Error closing HandLandmarker instance:', e);
    }
    handLandmarkerInstance = null;
  }
}
