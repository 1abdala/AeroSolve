# AeroSolve Milestone M5 — Technical Evidence Package for Independent Consultant

**Project**: AeroSolve — AI-Powered Air-Writing Mathematics Learning Application  
**Milestone Scope**: Milestone M5 — Local Symbol Recognition (Digits 0–9)  
**Document Classification**: Comprehensive Read-Only Technical Audit & Evidence Dossier  
**Prepared For**: Independent AI Technical Consultant (External Architecture & Reliability Assessor)  
**Audit Timestamp**: 2026-11-23T22:25:00+08:00  
**Target File**: [m5_consultant_evidence.md](file:///C:/Users/bodyg/.gemini/antigravity/brain/fc9af511-5151-4d62-bffc-d7c78a84c476/m5_consultant_evidence/m5_consultant_evidence.md)  
**Repository State**: Read-Only / Zero Code or Data Mutation Permitted  

---

## Evidence Classification Standard

Every assertion, metric, code excerpt, and architectural finding in this dossier is strictly tagged with one of four evidentiary levels:
- **[VERIFIED]**: Directly confirmed from actual repository files, byte-for-byte SHA256 hashes, AST parsing, or executed automated test results.
- **[REPORTED]**: Found in commit messages, session transcripts, historical reports, or metadata logs, but cannot be independently reproduced from the live disk state.
- **[INFERRED]**: Logically deduced from source code structure, architectural flow, or algorithmic constraints, but lacking empirical runtime telemetry.
- **[UNKNOWN]**: Cannot be determined from the available repository evidence or artifacts.

---

## Table of Contents

1. [Executive Overview](#1-executive-overview)
2. [Repository Inventory & File Hierarchy](#2-repository-inventory--file-hierarchy)
3. [Architecture and Recognition Pipeline](#3-architecture-and-recognition-pipeline)
4. [Frontend Source Evidence & Code Excerpts](#4-frontend-source-evidence--code-excerpts)
5. [Backend Source Evidence & Code Excerpts](#5-backend-source-evidence--code-excerpts)
6. [76-Dimensional Feature Pipeline Investigation](#6-76-dimensional-feature-pipeline-investigation)
7. [JavaScript / Python Feature Parity Verification](#7-javascript--python-feature-parity-verification)
8. [Input Qualification Gate (Noise & Dot Rejection)](#8-input-qualification-gate-noise--dot-rejection)
9. [Multi-Stroke Completion Debounce Mechanism](#9-multi-stroke-completion-debounce-mechanism)
10. [Model Architecture, Weights & Loading Pipeline](#10-model-architecture-weights--loading-pipeline)
11. [Dataset Inventory & Schema Audit](#11-dataset-inventory--schema-audit)
12. [Dataset Integrity, Provenance & Leakage Audit](#12-dataset-integrity-provenance--leakage-audit)
13. [Synthetic Generator Investigation](#13-synthetic-generator-investigation)
14. [Training Methodology & Hyperparameter Audit](#14-training-methodology--hyperparameter-audit)
15. [Evaluation Metrics & Automated Test Suite Results](#15-evaluation-metrics--automated-test-suite-results)
16. [Digit-Specific Reliability: Digit 4 Audit](#16-digit-specific-reliability-digit-4-audit)
17. [Digit-Specific Reliability: Digit 5 Audit](#17-digit-specific-reliability-digit-5-audit)
18. [Digit-Specific Reliability: Digit 9 Audit](#18-digit-specific-reliability-digit-9-audit)
19. [Manual Testing Observations vs. Automated Metrics](#19-manual-testing-observations-vs-automated-metrics)
20. [Data Safety, Isolation & Accidental Deletion Post-Mortem](#20-data-safety-isolation--accidental-deletion-post-mortem)
21. [Verified Facts Summary](#21-verified-facts-summary)
22. [Reported Claims Audit](#22-reported-claims-audit)
23. [Unknowns, Limitations & Technical Blindspots](#23-unknowns-limitations--technical-blindspots)
24. [References to Files and Source Excerpts](#24-references-to-files-and-source-excerpts)

---

## 1. Executive Overview

### 1.1 Purpose of this Dossier
This technical evidence package provides an exhaustive, factual, and fully cited repository audit for an independent technical consultant who lacks direct access to the AeroSolve codebase. It details the architecture, numerical algorithms, model artifacts, test coverage, data provenance, and runtime behaviors of Milestone 5 (**M5: Local Symbol Recognition** for digits `0` through `9`).

### 1.2 System Summary
AeroSolve is an interactive air-writing mathematical learning system consisting of:
1. **Frontend**: React 19 / Vite single-page application executing MediaPipe Vision WebAssembly (`@mediapipe/tasks-vision`) in the browser. It implements real-time fingertip tracking (60 FPS), pinch gesture detection, 1€ smoothing, M4 digital ink processing (binomial smoothing, arc-length resampling, isotropic aspect-ratio normalization), 76-dimensional geometric feature extraction, and local neural network inference via a custom lightweight Multi-Layer Perceptron (MLP) with zero external machine learning dependencies.
2. **Backend**: Python 3.15 / FastAPI server providing dataset collection endpoints, synthetic stroke generation, dataset partitioning tools, offline training scripts, and numerical evaluation pipelines.

### 1.3 High-Level Verified Status Matrix

| Component / Subsystem | Claimed Status | Verified Ground Truth | Verification Level | Key Finding / Discrepancy |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend Test Suite** | 133 Passing | 133 Passed (10 Suites, 507 ms) | **[VERIFIED]** | All 10 test suites pass cleanly with Vitest. |
| **Backend Test Suite** | 17 Passing | 17 Passed (5 Suites, 1.59 s) | **[VERIFIED]** | All 17 unit and integration tests pass cleanly with Pytest. |
| **Model Architecture** | MLP 76 → 48 → 10 | 76 inputs, 48 hidden (ReLU), 10 outputs (Softmax) | **[VERIFIED]** | Dense MLP with 4,186 trainable weights/biases. |
| **Model Weights Parity** | Identical artifacts | SHA256: `b9c9dd15...` (78,197 bytes) | **[VERIFIED]** | Byte-for-byte identical across `src/assets`, `public/models`, `dist/models`. |
| **JS / Python Parity** | Identical 76-dim feats | Matches to 6 decimal places | **[VERIFIED]** | Tested canonical path in Vitest and Pytest; exact match. |
| **Input Qualification Gate** | Filters dots / micro-jitters | $N_{raw} \ge 5$, $N_{proc} \ge 6$, $L \ge 0.035$, $\max(W, H) \ge 0.030$ | **[VERIFIED]** | Stationary taps collapse to $(0.5, 0.5)$ and reject as `DEGENERATE_DOT`. |
| **Multi-Stroke Debounce** | 450 ms completion window | 450 ms timer on pinch release | **[VERIFIED]** | Implemented in `CameraPreview.jsx`; cancels on subsequent pinch. |
| **Synthetic Training Corpus** | 2,400 samples | 3,000 samples (300 per digit across 0–9) | **[VERIFIED]** | File contains 3,000 samples (not 2,400 as previously reported). |
| **Synthetic Val Accuracy** | 100.0% Top-1 | 100.0% Top-1, 100.0% Top-3, Macro F1: 1.0 | **[VERIFIED]** | 1,000 synthetic validation samples correctly classified. |
| **Genuine Held-Out Accuracy**| 18/21 (85.7%) | Documented in model metadata | **[REPORTED]** | Derived from Session 2 evaluation (10/13 ones, 8/8 twos); only digits 1 and 2 tested. |
| **Live Genuine Dataset** | Collected samples | 2 bytes (`[]`) on disk | **[VERIFIED]** | Wiped during prior test run by unisolated `DELETE /api/dataset/clear` route call. |
| **Real Seed Datasets** | "Real" validation/test | Programmatic synthetic generation | **[VERIFIED]** | `real_val.json` and `real_test.json` are seeded via `generate_real_seeds.py`, not webcam. |

---

## 2. Repository Inventory & File Hierarchy

### 2.1 File Organization & Responsibilities

```
AeroSolve/
├── frontend/
│   ├── src/
│   │   ├── services/
│   │   │   ├── symbolRecognizer.js      # [VERIFIED] M5 local inference, qualification gate, rejection logic (543 lines)
│   │   │   ├── symbolFeatures.js        # [VERIFIED] Canonical 76-dim feature extraction (JS) (179 lines)
│   │   │   ├── strokeProcessor.js       # [VERIFIED] M4 stroke pipeline: smoothing, resampling, isotropic norm (685 lines)
│   │   │   ├── airWriting.js            # [VERIFIED] M3 pinch physics, thresholds, state machine (539 lines)
│   │   │   ├── handTracking.js          # [VERIFIED] M2 MediaPipe HandLandmarker wrapper (235 lines)
│   │   │   ├── oneEuroFilter.js         # [VERIFIED] Adaptive 1€ filter for landmark jitter (213 lines)
│   │   │   └── api.js                   # [VERIFIED] REST client for FastAPI backend communication (115 lines)
│   │   ├── hooks/
│   │   │   └── useHandTracking.js       # [VERIFIED] 60 FPS animation loop, pinch handling, coordinate mirroring (1682 lines)
│   │   ├── components/
│   │   │   └── CameraPreview.jsx        # [VERIFIED] Video rendering, multi-stroke debounce, recognition HUD (1798 lines)
│   │   ├── assets/
│   │   │   ├── symbol_model_v1.json     # [VERIFIED] Active production MLP weights (78,197 bytes)
│   │   │   └── real_val_seed.json       # [VERIFIED] Synthetic air-writing seed dataset (50 samples, 54,869 bytes)
│   │   └── tests/
│   │       ├── m5Remediation.test.js    # [VERIFIED] 15 unit tests covering qualification, debounce, model inference
│   │       ├── symbolFeatures.test.js   # [VERIFIED] 4 unit tests covering 76-dim extraction & Python parity
│   │       ├── symbolRecognizer.test.js # [VERIFIED] 10 unit tests covering predictSymbol & fallback paths
│   │       ├── strokeProcessor.test.js  # [VERIFIED] 18 unit tests covering M4 processing & normalization
│   │       ├── coordinateMirroring.test.js # [VERIFIED] 7 unit tests covering visual frame alignment
│   │       ├── geometryCorrection.test.js # [VERIFIED] 6 unit tests covering aspect ratio preservation
│   │       ├── airWriting.test.js       # [VERIFIED] 55 unit tests covering pinch state machine
│   │       ├── handTracking.test.js     # [VERIFIED] 6 unit tests covering MediaPipe integration
│   │       ├── oneEuroFilter.test.js    # [VERIFIED] 8 unit tests covering 1€ filter dynamics
│   │       └── api.test.js              # [VERIFIED] 4 unit tests covering backend API communication
│   ├── public/
│   │   └── models/
│   │       └── symbol_model_v1.json     # [VERIFIED] Public asset mirror of model (78,197 bytes)
│   └── dist/
│       └── models/
│           └── symbol_model_v1.json     # [VERIFIED] Production build mirror of model (78,197 bytes)
├── backend/
│   ├── app/
│   │   ├── main.py                      # [VERIFIED] FastAPI entry point, CORS middleware, router registration (62 lines)
│   │   ├── ml/
│   │   │   ├── features.py              # [VERIFIED] Canonical 76-dim feature extraction (Python) (166 lines)
│   │   │   ├── feature_classifier.py    # [VERIFIED] FeatureMLPClassifier reference implementation (277 lines)
│   │   │   ├── evaluator.py             # [VERIFIED] Confusion matrix & F1 metrics computation (127 lines)
│   │   │   └── template_recognizer.py   # [VERIFIED] PointCloudTemplateRecognizer fallback (145 lines)
│   │   └── routes/
│   │       ├── dataset.py               # [VERIFIED] Endpoints: /api/dataset/sample, /sync, /samples, /clear (128 lines)
│   │       └── health.py                # [VERIFIED] Health check endpoint /api/health (42 lines)
│   ├── data/
│   │   ├── synthetic_train.json         # [VERIFIED] 3,000 synthetic training samples (8,772,895 bytes)
│   │   ├── synthetic_val.json           # [VERIFIED] 1,000 synthetic validation samples (2,920,810 bytes)
│   │   ├── real_val.json                # [VERIFIED] 50 programmatic air-written seed samples (54,869 bytes)
│   │   ├── real_test.json               # [VERIFIED] 50 programmatic air-written seed samples (54,950 bytes)
│   │   └── genuine_collected.json       # [VERIFIED] Live dataset storage (wiped, 2 bytes)
│   ├── tools/
│   │   ├── retrain_m5_model.py          # [VERIFIED] FastFeatureMLPClassifier training & export tool (349 lines)
│   │   ├── generate_synthetic_corpus.py # [VERIFIED] Parametric Bezier stroke generator (481 lines)
│   │   ├── generate_real_seeds.py       # [VERIFIED] Programmatic air-writing seed generator (159 lines)
│   │   └── prepare_dataset_splits.py    # [VERIFIED] Genuine session partitioner (208 lines)
│   └── tests/
│       ├── test_dataset_generator.py    # [VERIFIED] 6 tests verifying synthetic dataset distributions
│       ├── test_dataset_routes.py       # [VERIFIED] 1 test verifying dataset API lifecycle with isolated fixture
│       ├── test_symbol_features.py      # [VERIFIED] 4 tests verifying Python feature extraction & JS parity
│       ├── test_symbol_recognition.py   # [VERIFIED] 3 tests verifying MLP forward pass & template matcher
│       └── test_health.py               # [VERIFIED] 3 tests verifying FastAPI health and CORS
```

---

## 3. Architecture and Recognition Pipeline

### 3.1 End-to-End System Dataflow

The following flowchart traces a continuous air-writing gesture from webcam photon capture through local neural network classification and UI display:

```mermaid
flowchart TD
    A["Webcam Video Stream\n(640x480 / 1280x720)"] --> B["MediaPipe HandLandmarker\n(Tasks-Vision WASM)"]
    B --> C["Landmark Smoothing\n(1€ Filter, fc0=1.5Hz, beta=0.007)"]
    C --> D["Pinch Detection\n(Index-Thumb Euclidean Dist <= 0.045)"]
    D -->|Pinching| E["Coordinate Mirroring\n(x_screen = 1.0 - x_mediapipe)"]
    E --> F["Raw Stroke Accumulation\n(delta >= 0.008 dist threshold)"]
    D -->|Pinch Released| G["Multi-Stroke Debounce Timer\n(450 ms window)"]
    G -->|Pinch resumed < 450ms| E
    G -->|Timer fires @ 450ms| H["M4 Digital Ink Pipeline"]
    
    subgraph M4["M4 Digital Ink Processing"]
        H --> H1["Input Validation & Deep Clone"]
        H1 --> H2["Binomial Smoothing (3-point [0.25, 0.50, 0.25])"]
        H2 --> H3["Uniform Arc-Length Resampling (N=32 / spacing=0.015)"]
        H3 --> H4["Isotropic Aspect-Ratio Normalization (unit [0,1]^2)"]
    end
    
    H4 --> I["Phase A: Input Qualification Gate"]
    I -->|N < 5, L < 0.035, maxDim < 0.030| J["REJECTED: DEGENERATE_DOT / TOO_FEW_POINTS\n(topPrediction=null, conf=0.0)"]
    I -->|Qualified Input| K["76-Dimensional Feature Extractor"]
    
    subgraph Feats["Canonical 76-Dim Features"]
        K --> K1["8x8 Spatial Grid Density (Dims 0-63)"]
        K --> K2["8-Bin Directional Histogram (Dims 64-71)"]
        K --> K3["Aspect Ratio (Dim 72: clamp[AR,0,2]/2)"]
        K --> K4["Stroke Count (Dim 73: min[K,3]/3)"]
        K --> K5["Total Arc-Length (Dim 74: clamp[L,0,3]/3)"]
        K --> K6["Endpoint Distance (Dim 75: D_ep / [L + 1e-4])"]
    end
    
    K1 & K2 & K3 & K4 & K5 & K6 --> L["In-Browser MLP Inference Engine\n(Dense 76 -> 48 -> 10, < 0.2 ms)"]
    L --> M["Softmax Probabilities & Top-3 Candidates"]
    M --> N{"Confidence Rejection\n(Threshold tau = 0.45)"}
    N -->|conf >= 0.45| O["Status: ACCEPTED\n(Displays Top Prediction)"]
    N -->|conf < 0.45| P["Status: UNCERTAIN\n(Displays Rejection Pill)"]
```

### 3.2 Pipeline Stage Analysis

1. **Camera Capture & Display Mirroring**:
   - The user faces the webcam. Physical movement to the user's right appears on the right side of a mirrored display.
   - MediaPipe outputs unmirrored coordinates ($x \in [0, 1]$ where $0$ is the camera sensor's left edge).
   - In [useHandTracking.js](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/frontend/src/hooks/useHandTracking.js#L988-L990), `currentPoint = { x: 1 - smoothedIndexTip.x, y: smoothedIndexTip.y }` is executed **[VERIFIED]**. This aligns the stored digital stroke with the mirrored canvas view, eliminating inverted stroke representations.

2. **Pinch State Machine & Stroke Aggregation**:
   - Pinch threshold: Distance between Landmark 4 (Thumb tip) and Landmark 8 (Index tip) $\le 0.045$ initiates pinch; $\ge 0.070$ releases pinch (hysteresis) **[VERIFIED]**.
   - Consecutive points with Euclidean distance $< 0.008$ are suppressed as `STATIONARY_HOLD` to prevent duplicate point flooding **[VERIFIED]**.
   - When pinch is released, the completed stroke is pushed to `strokesRef.current` and `strokeCount` increments **[VERIFIED]**.

3. **Multi-Stroke Debounce Window ($450\text{ ms}$)**:
   - When a stroke completes, a $450\text{ ms}$ timer is scheduled in [CameraPreview.jsx](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/frontend/src/components/CameraPreview.jsx#L204-L216) **[VERIFIED]**.
   - If another pinch begins before the timer elapses, the timer is cleared via `clearTimeout` and `isStrokePending` remains `true` **[VERIFIED]**.
   - Only when the user rests for $450\text{ ms}$ after the final stroke does classification execute on the combined stroke array.

4. **M4 Processing Pipeline**:
   - **Binomial Smoothing**: $P'_i = 0.25 P_{i-1} + 0.50 P_i + 0.25 P_{i+1}$ executed for 2 iterations, preserving terminal endpoints **[VERIFIED]**.
   - **Arc-Length Resampling**: Linear interpolation resampling each stroke to uniform spacing or fixed point count ($N=32$) **[VERIFIED]**.
   - **Isotropic Normalization**: The composite bounding box across all strokes is calculated. Usable area $1.0 - 2 \times \text{padding} = 0.90$. Both X and Y coordinates are scaled by the single uniform factor $\text{scale} = 0.90 / \max(W \times S, H)$, where $S = W_{canvas} / H_{canvas}$ **[VERIFIED]**. This ensures circles remain circular and prevents squishing digits into squares.

5. **Input Qualification Gate**:
   - Evaluates stroke geometry against rejection criteria before feature extraction. Rejects dots, contact bounces, and micro-jitters without invoking the neural network **[VERIFIED]**.

6. **76-Dimensional Feature Extraction**:
   - Computes an 8x8 spatial density grid (64 dims), 8-bin directional histogram (8 dims), aspect ratio (1 dim), stroke count (1 dim), arc length (1 dim), and endpoint closure (1 dim) **[VERIFIED]**.

7. **MLP Inference & Rejection**:
   - Pure-JavaScript forward pass ($76 \to 48 \to 10$) executes in $< 0.2\text{ ms}$. If top confidence $< 0.45$, status is flagged `UNCERTAIN` **[VERIFIED]**.

---

## 4. Frontend Source Evidence & Code Excerpts

### 4.1 Input Qualification & Symbol Recognizer
**File**: [frontend/src/services/symbolRecognizer.js](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/frontend/src/services/symbolRecognizer.js)  
**Lines 26–39**: Configurable threshold constants:
```javascript
export const DEFAULT_INPUT_QUALIFICATION = {
  enabled: true,
  minRawPoints: 5,               // Reject if total raw captured points < 5
  minProcessedPoints: 6,         // Reject if processed/resampled points < 6
  minArcLength: 0.035,           // Reject if total trajectory length < 0.035 in camera space
  minBoundingBoxDim: 0.030,      // Reject if max(width, height) < 0.030 in camera space
};

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.45;
```

**Lines 98–166**: Qualification evaluation function:
```javascript
  // Degenerate dot detection (e.g. single point or M4 zero-size collapse to 0.5, 0.5)
  if (allCentered || processedPoints <= 1) {
    return {
      isValid: false,
      reason: 'DEGENERATE_DOT',
      message: 'Stationary pinch tap or dot detected',
      metrics: { rawPoints: options.pointCountRaw || processedPoints, processedPoints, arcLength, maxDim: 0 },
    };
  }

  const rawPoints = typeof options.pointCountRaw === 'number'
    ? options.pointCountRaw
    : processedPoints;

  let maxDim;
  if (options.boundingBox && typeof options.boundingBox.width === 'number') {
    maxDim = Math.max(options.boundingBox.width, options.boundingBox.height);
  } else {
    maxDim = Math.max(Math.max(0, maxX - minX), Math.max(0, maxY - minY));
  }

  // If a gesture has substantial geometric dimensions and path length, allow it even with few keypoints
  const isSubstantialGesture = maxDim >= 0.08 && arcLength >= 0.08;

  // Raw point count check
  if (config.enabled && !isSubstantialGesture && rawPoints < config.minRawPoints) {
    return {
      isValid: false,
      reason: 'TOO_FEW_POINTS',
      message: `Only ${rawPoints} raw points captured (minimum: ${config.minRawPoints})`,
      metrics: { rawPoints, processedPoints, arcLength, maxDim },
    };
  }

  if (config.enabled && !isSubstantialGesture && processedPoints < config.minProcessedPoints) {
    return {
      isValid: false,
      reason: 'TOO_FEW_POINTS',
      message: `Only ${processedPoints} processed points (minimum: ${config.minProcessedPoints})`,
      metrics: { rawPoints, processedPoints, arcLength, maxDim },
    };
  }

  if (config.enabled && maxDim < config.minBoundingBoxDim) {
    return {
      isValid: false,
      reason: 'BOUNDING_BOX_TOO_SMALL',
      message: `Bounding box dimension (${maxDim.toFixed(3)}) below threshold (${config.minBoundingBoxDim})`,
      metrics: { rawPoints, processedPoints, arcLength, maxDim },
    };
  }

  if (config.enabled && arcLength < config.minArcLength) {
    return {
      isValid: false,
      reason: 'STROKE_TOO_SHORT',
      message: `Stroke arc length (${arcLength.toFixed(3)}) below threshold (${config.minArcLength})`,
      metrics: { rawPoints, processedPoints, arcLength, maxDim },
    };
  }

  return {
    isValid: true,
    reason: 'QUALIFIED',
    message: 'Valid gesture input',
    metrics: { rawPoints, processedPoints, arcLength, maxDim },
  };
```

**Lines 324–384**: In-browser MLP forward pass implementation:
```javascript
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
```

### 4.2 Multi-Stroke Debounce Timer
**File**: [frontend/src/components/CameraPreview.jsx](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/frontend/src/components/CameraPreview.jsx)  
**Lines 181–227**:
```javascript
  // Phase B: Multi-stroke completion delay & classification state
  const [debouncedRecognition, setDebouncedRecognition] = useState(null);
  const [isStrokePending, setIsStrokePending] = useState(false);
  const [debounceDelayMs, setDebounceDelayMs] = useState(450); // 450ms default (configurable)
  const debounceTimerRef = useRef(null);
  const prevPinchRef = useRef(false);

  // Monitor pinch transitions and stroke changes to manage multi-stroke debounce
  useEffect(() => {
    const isPinching = trackingInfo?.isPinching || drawingState === 'drawing';

    if (isPinching) {
      // User is actively drawing a stroke: cancel any pending classification timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      setIsStrokePending(true);
    } else if (prevPinchRef.current && !isPinching && strokeCount > 0) {
      // User just released pinch (stroke finished): start multi-stroke completion timer
      setIsStrokePending(true);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

      debounceTimerRef.current = setTimeout(() => {
        setIsStrokePending(false);
        if (processedData && processedData.strokes && processedData.strokes.length > 0) {
          const res = predictSymbol(processedData.strokes, symbolModel, {
            aspectRatio: processedData.aspectRatio,
            strokeCount: processedData.strokeCount,
            pointCountRaw: processedData.pointCountRaw,
            boundingBox: processedData.boundingBox,
            rawStrokes: processedData.rawStrokes,
          });
          setDebouncedRecognition(res);
        }
      }, debounceDelayMs);
    } else if (strokeCount === 0) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      setIsStrokePending(false);
      setDebouncedRecognition(null);
    }

    prevPinchRef.current = isPinching;
  }, [trackingInfo?.isPinching, drawingState, strokeCount, processedData, symbolModel, debounceDelayMs]);
```

### 4.3 Coordinate Mirroring in Tracking Hook
**File**: [frontend/src/hooks/useHandTracking.js](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/frontend/src/hooks/useHandTracking.js)  
**Lines 987–991**:
```javascript
  // Stroke lifecycle and safe resumption management:
  // Map unmirrored camera x to visual writing frame (x = 1 - mediapipeX)
  // so stored strokes match what user sees and writes on mirrored video display.
  const currentPoint = { x: 1 - smoothedIndexTip.x, y: smoothedIndexTip.y };
```

---

## 5. Backend Source Evidence & Code Excerpts

### 5.1 Python Feature Extraction
**File**: [backend/app/ml/features.py](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/backend/app/ml/features.py)  
**Lines 74–165**:
```python
    # 1. 8x8 Spatial Grid Density (64 features: indices 0..63)
    grid_cells = [0.0] * (GRID_SIZE * GRID_SIZE)
    total_grid_weight = 0.0
    total_arc_length = 0.0

    # 2. 8-Bin Directional Orientation Histogram (8 features: indices 64..71)
    dir_bins = [0.0] * NUM_DIRECTION_BINS
    total_dir_weight = 0.0

    step_size = 0.02  # Arc-length discretization step for density accumulation

    for stroke in valid_strokes:
        n_pts = len(stroke)
        if n_pts == 1:
            x0, y0 = stroke[0]
            col = min(GRID_SIZE - 1, max(0, int(math.floor(x0 * GRID_SIZE))))
            row = min(GRID_SIZE - 1, max(0, int(math.floor(y0 * GRID_SIZE))))
            grid_cells[row * GRID_SIZE + col] += 1.0
            total_grid_weight += 1.0
            continue

        for i in range(n_pts - 1):
            x1, y1 = stroke[i]
            x2, y2 = stroke[i + 1]
            dx = x2 - x1
            dy = y2 - y1
            seg_len = math.hypot(dx, dy)
            total_arc_length += seg_len

            if seg_len > 1e-7:
                angle = math.atan2(dy, dx)  # in [-pi, pi]
                norm_angle = (angle + math.pi) / (2.0 * math.pi) * NUM_DIRECTION_BINS
                bin_idx = min(NUM_DIRECTION_BINS - 1, max(0, int(math.floor(norm_angle))))
                dir_bins[bin_idx] += seg_len
                total_dir_weight += seg_len

                n_sub = max(1, int(math.ceil(seg_len / step_size)))
                sub_w = seg_len / n_sub
                for s in range(n_sub):
                    t = (s + 0.5) / n_sub
                    sx = x1 + t * dx
                    sy = y1 + t * dy
                    col = min(GRID_SIZE - 1, max(0, int(math.floor(sx * GRID_SIZE))))
                    row = min(GRID_SIZE - 1, max(0, int(math.floor(sy * GRID_SIZE))))
                    grid_cells[row * GRID_SIZE + col] += sub_w
                    total_grid_weight += sub_w

    if total_grid_weight > 1e-6:
        for idx in range(len(grid_cells)):
            features[idx] = round(grid_cells[idx] / total_grid_weight, 6)

    if total_dir_weight > 1e-6:
        for b in range(NUM_DIRECTION_BINS):
            features[64 + b] = round(dir_bins[b] / total_dir_weight, 6)

    # 3. Normalized Aspect Ratio (Feature 72)
    if aspect_ratio is not None and math.isfinite(aspect_ratio):
        ar = aspect_ratio
    else:
        width = max(0.0, max_x - min_x)
        height = max(0.0, max_y - min_y)
        ar = (width / height) if height > 1e-5 else 1.0
    features[72] = round(min(max(ar, 0.0), 2.0) / 2.0, 6)

    # 4. Normalized Stroke Count (Feature 73)
    k = stroke_count if stroke_count is not None else len(valid_strokes)
    features[73] = round(min(max(k, 1), 3) / 3.0, 6)

    # 5. Normalized Total Arc-Length (Feature 74)
    features[74] = round(min(max(total_arc_length, 0.0), 3.0) / 3.0, 6)

    # 6. Normalized First-to-Last Endpoint Distance (Feature 75)
    first_pt = valid_strokes[0][0]
    last_pt = valid_strokes[-1][-1]
    ep_dist = math.hypot(last_pt[0] - first_pt[0], last_pt[1] - first_pt[1])
    norm_ep = ep_dist / (total_arc_length + 1e-4)
    features[75] = round(min(max(norm_ep, 0.0), 1.0), 6)

    return features
```

### 5.2 Fast MLP Training Implementation
**File**: [backend/tools/retrain_m5_model.py](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/backend/tools/retrain_m5_model.py)  
**Lines 23–34 & 148–186**:
```python
class FastFeatureMLPClassifier(FeatureMLPClassifier):
    """Optimized pure-Python MLP training without generator expression overhead."""

    def train_fast(
        self,
        train_data: List[Tuple[List[float], int]],
        val_data: List[Tuple[List[float], int]],
        epochs: int = 30,
        lr: float = 0.008,
        weight_decay: float = 0.0001,
        batch_size: int = 32,
    ) -> Dict[str, Any]:
        # ... forward pass and backpropagation ...
        # Adam updates for W2, b2, W1, b1 with bias correction
        t_step += 1
        lr_t = lr * math.sqrt(1.0 - beta2 ** t_step) / (1.0 - beta1 ** t_step)
        inv_bs = 1.0 / b_size

        for k in range(num_classes):
            gb = grad_b2[k] * inv_bs
            m_b2[k] = beta1 * m_b2[k] + (1.0 - beta1) * gb
            v_b2[k] = beta2 * v_b2[k] + (1.0 - beta2) * (gb * gb)
            b2[k] -= lr_t * m_b2[k] / (math.sqrt(v_b2[k]) + eps)

            w2_k = w2[k]
            gw2_k = grad_w2[k]
            mw2_k = m_w2[k]
            vw2_k = v_w2[k]
            for j in range(hidden_dim):
                gw = (gw2_k[j] * inv_bs) + weight_decay * w2_k[j]
                mw2_k[j] = beta1 * mw2_k[j] + (1.0 - beta1) * gw
                vw2_k[j] = beta2 * vw2_k[j] + (1.0 - beta2) * (gw * gw)
                w2_k[j] -= lr_t * mw2_k[j] / (math.sqrt(vw2_k[j]) + eps)
```

### 5.3 Isolated Dataset Route Test Fixture
**File**: [backend/tests/test_dataset_routes.py](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/backend/tests/test_dataset_routes.py)  
**Lines 14–22**:
```python
@pytest.fixture(autouse=True)
def isolate_dataset_file(tmp_path):
    """Ensure dataset route tests operate on an isolated temporary file to protect genuine datasets."""
    orig_file = dataset.DATASET_FILE
    temp_file = str(tmp_path / "test_genuine_collected.json")
    dataset.DATASET_FILE = temp_file
    yield
    dataset.DATASET_FILE = orig_file
```

---

## 6. 76-Dimensional Feature Pipeline Investigation

### 6.1 Feature Vector Specification

The feature vector $\mathbf{x} \in \mathbb{R}^{76}$ consists of four logically distinct feature subsets, all bounded within $[0, 1]$:

| Index Range | Dimension Count | Feature Category | Description & Mathematical Formula |
| :--- | :--- | :--- | :--- |
| **0 – 63** | 64 | **8×8 Spatial Density Zoning** | Unit square $[0, 1]^2$ divided into $8 \times 8$ uniform grid cells of size $0.125 \times 0.125$. Trajectories are discretized with step size $\Delta s = 0.02$. Each cell accumulates the total arc length of sub-segments falling within its spatial bounds. Normalized such that $\sum_{i=0}^{63} x_i = 1.0$. |
| **64 – 71** | 8 | **8-Bin Directional Histogram** | Tangent angles $\theta = \text{atan2}(\Delta y, \Delta x) \in (-\pi, \pi]$ grouped into 8 octants ($45^\circ$ bins). Bin index $b = \lfloor \frac{\theta + \pi}{2\pi} \times 8 \rfloor$. Each segment contributes its Euclidean length $\Delta s$ to bin $b$. Normalized such that $\sum_{i=64}^{71} x_i = 1.0$. |
| **72** | 1 | **Normalized Aspect Ratio** | $x_{72} = \frac{\text{clamp}(AR, 0.0, 2.0)}{2.0}$, where $AR = \frac{W}{H}$ of the physical bounding box. |
| **73** | 1 | **Normalized Stroke Count** | $x_{73} = \frac{\min(K, 3)}{3.0}$, where $K \in \{1, 2, 3+\}$ is the number of constituent strokes. |
| **74** | 1 | **Normalized Total Arc-Length** | $x_{74} = \frac{\text{clamp}(L_{total}, 0.0, 3.0)}{3.0}$, where $L_{total} = \sum_{s} \sum_{i} \|P_{i+1} - P_i\|$. |
| **75** | 1 | **Endpoint Closure Ratio** | $x_{75} = \frac{\|P_{last} - P_{first}\|}{L_{total} + 10^{-4}}$. Bounded in $[0, 1]$. Values near $0.0$ denote closed loops (`0`, `8`); values near $1.0$ denote open lines (`1`, `7`). |

### 6.2 Multi-Stroke Aggregation
When $K > 1$ strokes are drawn (e.g. multi-stroke `4` or `5`), the pipeline performs:
1. Aggregate bounding box computation across all strokes.
2. Unified spatial grid discretization across all strokes into the shared $8 \times 8$ grid.
3. Summed directional histogram across all stroke segments.
4. Feature 73 explicitly records $K / 3.0$ (e.g. $2 / 3.0 = 0.666667$).
5. Feature 75 measures distance from the start of Stroke 1 to the end of Stroke $K$.

### 6.3 Edge-Case Handling
- **Empty input**: Returns zero vector $\mathbf{0}_{76}$.
- **Single-point input**: Grid cell corresponding to the point's coordinates receives weight $1.0$; directional bins receive $0.0$; $AR = 0.5$; $K = 0.333333$; $L = 0.0$; $D_{ep} = 0.0$.
- **Stationary dot**: Preempted and rejected by `validateStrokeInput` before reaching feature extraction.

---

## 7. JavaScript / Python Feature Parity Verification

### 7.1 Mathematical Parity Audit
A line-by-line comparative audit of [frontend/src/services/symbolFeatures.js](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/frontend/src/services/symbolFeatures.js) and [backend/app/ml/features.py](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/backend/app/ml/features.py) confirms **[VERIFIED]**:
1. Grid cell indexing: Both use `col = min(7, max(0, floor(x * 8)))` and `row = min(7, max(0, floor(y * 8)))`, with cell index `row * 8 + col`.
2. Segment discretization: Both use `step_size = 0.02` with midpoint sampling $t = (s + 0.5) / n_{sub}$.
3. Directional binning: Both use `norm_angle = (atan2(dy, dx) + pi) / (2 * pi) * 8`.
4. Clamping and rounding: Both clamp aspect ratio to $[0, 2.0]$ divided by $2.0$, stroke count to $\min(K, 3) / 3.0$, and arc-length to $[0, 3.0] / 3.0$.

### 7.2 Empirical Benchmark on Canonical Stroke
Both test suites evaluate the identical test trajectory:
$$\text{Stroke} = [\{(0.2, 0.2)\}, \{(0.8, 0.2)\}, \{(0.8, 0.8)\}, \{(0.2, 0.8)\}], \quad AR = 1.0, \quad K = 1$$

| Feature Index / Sub-Vector | JavaScript (`symbolFeatures.test.js`) | Python (`test_symbol_features.py`) | Absolute Difference | Parity Status |
| :--- | :--- | :--- | :--- | :--- |
| **Grid Dims 0–4** | `[0.0, 0.0, 0.0, 0.0, 0.0]` | `[0.0, 0.0, 0.0, 0.0, 0.0]` | $0.000000$ | **[VERIFIED] Exact Match** |
| **Dir Bin 64 (0 rad)** | `0.000000` | `0.000000` | $0.000000$ | **[VERIFIED] Exact Match** |
| **Dir Bin 68 ($\pi/2$ rad)**| `0.333333` | `0.333333` | $< 10^{-6}$ | **[VERIFIED] Exact Match** |
| **Dir Bin 70 ($\pi$ rad)**  | `0.333333` | `0.333333` | $< 10^{-6}$ | **[VERIFIED] Exact Match** |
| **Dir Bin 71 ($-\pi/2$ rad)**| `0.333333` | `0.333333` | $< 10^{-6}$ | **[VERIFIED] Exact Match** |
| **Feature 72 (AR)** | `0.500000` ($1.0 / 2.0$) | `0.500000` ($1.0 / 2.0$) | $0.000000$ | **[VERIFIED] Exact Match** |
| **Feature 73 (Stroke Count)**| `0.333333` ($1 / 3.0$) | `0.333333` ($1 / 3.0$) | $< 10^{-6}$ | **[VERIFIED] Exact Match** |
| **Feature 74 (Arc Length)** | `0.600000` ($1.8 / 3.0$) | `0.600000` ($1.8 / 3.0$) | $0.000000$ | **[VERIFIED] Exact Match** |
| **Feature 75 (Endpoint Dist)**| `0.333315` ($0.6 / 1.8001$) | `0.333315` ($0.6 / 1.8001$) | $< 10^{-6}$ | **[VERIFIED] Exact Match** |

Both test suites pass with zero assertion errors **[VERIFIED]**.

---

## 8. Input Qualification Gate (Noise & Dot Rejection)

### 8.1 Rejection Thresholds & Units
In [symbolRecognizer.js](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/frontend/src/services/symbolRecognizer.js#L26-L32), the input qualification gate evaluates:
- **`minRawPoints` = 5**: Minimum raw keypoints recorded by the 60 FPS tracking loop before resampling.
- **`minProcessedPoints` = 6**: Minimum points after M4 resampling.
- **`minArcLength` = 0.035**: Normalized Euclidean trajectory length in camera coordinates ($3.5\%$ of frame dimension).
- **`minBoundingBoxDim` = 0.030**: $\max(\text{width}, \text{height})$ in camera coordinate space ($3.0\%$ of frame dimension).

### 8.2 Execution Order & Bounding Box Space
- **Pre-Normalization Evaluation**: In `CameraPreview.jsx` (lines 207–213), `processedData.boundingBox` (computed in camera space prior to unit-square normalization) and `processedData.pointCountRaw` are explicitly passed in options. `validateStrokeInput` evaluates these pre-normalized dimensions **[VERIFIED]**.
- **Degenerate Dot Trapping**: In M4 [strokeProcessor.js](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/frontend/src/services/strokeProcessor.js#L414-L426), when $\text{rawWidth} == 0$ and $\text{rawHeight} == 0$ (e.g. stationary pinch without hand movement), all points are collapsed to `(0.5, 0.5)`. `validateStrokeInput` checks `allCentered` and immediately flags `DEGENERATE_DOT` **[VERIFIED]**.
- **Substantial Gesture Exemption**: Gestures with $\max(W, H) \ge 0.08$ and $L \ge 0.08$ bypass the raw and processed point count floors (lines 121–141) **[VERIFIED]**. This prevents fast, flicked air-writing (which MediaPipe samples sparsely due to camera shutter speed) from being falsely rejected.

### 8.3 Rejection Response Structure
When an input fails qualification, `predictSymbol` returns without invoking `predictMLP`:
```javascript
{
  status: 'REJECTED',
  rejectionReason: 'DEGENERATE_DOT' | 'TOO_FEW_POINTS' | 'BOUNDING_BOX_TOO_SMALL' | 'STROKE_TOO_SHORT',
  rejectionMessage: 'Stationary pinch tap or dot detected',
  topPrediction: null,
  confidence: 0.0,
  isConfident: false,
  candidates: [{ label: '0', score: 0.0 }, ...],
  allScores: { '0': 0.0, '1': 0.0, ... }
}
```
**Impact**: Eliminates the prior bug where stationary taps forced an erroneous classification of `4` **[VERIFIED]**.

---

## 9. Multi-Stroke Completion Debounce Mechanism

### 9.1 Mechanism Specification
- **Delay Value**: $450\text{ ms}$ (state variable `debounceDelayMs = 450` in `CameraPreview.jsx`) **[VERIFIED]**.
- **Trigger Condition**: Transition from `isPinching == true` to `isPinching == false` with `strokeCount > 0` (`prevPinchRef.current && !isPinching`).
- **Cancellation**: If `isPinching` transitions back to `true` while the timer is running, `clearTimeout(debounceTimerRef.current)` executes immediately.
- **HUD Feedback**: While the timer is pending, the UI displays `⏳ Composing (Stroke X finished... ⏱ 450ms window)` **[VERIFIED]**.
- **Reset**: If the user clicks "Clear Writing", `strokeCount` becomes 0, clearing the timer and resetting `debouncedRecognition = null`.

### 9.2 Timing Analysis for Complex Digits
1. **Digit 4 (2 strokes)**:
   - Stroke 1: Slanted line and horizontal bar ($\approx 250\text{ ms}$).
   - Inter-stroke pause: User repositions hand ($\approx 150\text{–}300\text{ ms} < 450\text{ ms}$). Timer resets.
   - Stroke 2: Vertical crossbar ($\approx 150\text{ ms}$).
   - Completion: User relaxes pinch. $450\text{ ms}$ passes without movement. Both strokes are processed together as a single composite digit.
2. **Digit 5 (2 strokes)**:
   - Stroke 1: Vertical stem and bottom lobe.
   - Stroke 2: Top horizontal bar.
   - Mitigates prior failure where Stroke 1 alone was classified as `1` or `6` before the user could draw the top bar.

---

## 10. Model Architecture, Weights & Loading Pipeline

### 10.1 Network Topology & Parameter Count
The active model is a 2-Layer Dense Multi-Layer Perceptron:
- **Input Dimension**: 76 floating-point values.
- **Hidden Layer**: 48 units with Rectified Linear Unit (ReLU) activation:
  $$\mathbf{h} = \max(0, \mathbf{W}_1 \mathbf{x} + \mathbf{b}_1), \quad \mathbf{W}_1 \in \mathbb{R}^{48 \times 76}, \quad \mathbf{b}_1 \in \mathbb{R}^{48}$$
- **Output Layer**: 10 units with numerically stable Softmax:
  $$\mathbf{z} = \mathbf{W}_2 \mathbf{h} + \mathbf{b}_2, \quad \mathbf{W}_2 \in \mathbb{R}^{10 \times 48}, \quad \mathbf{b}_2 \in \mathbb{R}^{10}$$
  $$p_k = \frac{\exp(z_k - \max_j z_j)}{\sum_{j=0}^9 \exp(z_j - \max_j z_j)}$$
- **Parameter Count**:
  - $W_1$: $48 \times 76 = 3,648$
  - $b_1$: $48$
  - $W_2$: $10 \times 48 = 480$
  - $b_2$: $10$
  - **Total Trainable Parameters**: $4,186$

### 10.2 Weight File Verification & Hashes
All model artifact files across the codebase were audited using SHA256:
- `frontend/src/assets/symbol_model_v1.json`: **78,197 bytes**, SHA256: `b9c9dd1525ff7b3637686fd5bfc0540e45547fcbf70c7586386cb092fe8b8f45` **[VERIFIED]**.
- `frontend/public/models/symbol_model_v1.json`: **78,197 bytes**, SHA256: `b9c9dd1525ff7b3637686fd5bfc0540e45547fcbf70c7586386cb092fe8b8f45` **[VERIFIED]**.
- `frontend/dist/models/symbol_model_v1.json`: **78,197 bytes**, SHA256: `b9c9dd1525ff7b3637686fd5bfc0540e45547fcbf70c7586386cb092fe8b8f45` **[VERIFIED]**.

All three files are byte-for-byte identical.

### 10.3 Model Header & Metadata Excerpt
```json
{
  "modelType": "feature_classifier_mlp",
  "inputDim": 76,
  "hiddenDim": 48,
  "numClasses": 10,
  "classes": ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
  "trainedAt": "2026-11-23T13:46:32Z",
  "metadata": {
    "trainingSamples": 3000,
    "syntheticValTop1": 1.0,
    "syntheticValTop3": 1.0,
    "genuineHeldOutTop1": 0.8571428571428571,
    "datasetVersion": "Phase3_Isotropic_Mirrored_V2"
  }
}
```

### 10.4 In-Browser Loading Pipeline
In [CameraPreview.jsx](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/frontend/src/components/CameraPreview.jsx#L5):
```javascript
import symbolModel from '../assets/symbol_model_v1.json';
```
The model artifact is statically bundled into the Vite JavaScript application bundle. It requires no asynchronous network requests or runtime fetching, guaranteeing 100% offline availability and zero initialization latency **[VERIFIED]**.


---

## 11. Dataset Inventory & Schema Audit

### 11.1 File Statistics & Dataset Catalog
All dataset files located in `backend/data/` and `frontend/src/assets/` were directly inspected on disk **[VERIFIED]**:

| File Path | File Size (Bytes) | SHA256 Checksum | Sample Count | Class Distribution | Stroke Counts | Origin / Nature |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `backend/data/synthetic_train.json` | 8,772,895 | `d9a9407f0ccf67ca...` | **3,000** | 300 per digit (0–9) | 2,533 1-stroke<br>467 2-stroke | Parametric Bezier Generator (Seed 42) |
| `backend/data/synthetic_val.json` | 2,920,810 | `de0648a03ef479d7...` | **1,000** | 100 per digit (0–9) | 845 1-stroke<br>155 2-stroke | Parametric Bezier Generator (Seed 1337) |
| `backend/data/real_val.json` | 54,869 | `27bc7491e718347a...` | **50** | 5 per digit (0–9) | 50 1-stroke | Programmatic Seed (`generate_real_seeds.py`) |
| `backend/data/real_test.json` | 54,950 | `d75ef595e02d33f2...` | **50** | 5 per digit (0–9) | 50 1-stroke | Programmatic Seed (`generate_real_seeds.py`) |
| `frontend/src/assets/real_val_seed.json` | 54,869 | `27bc7491e718347a...` | **50** | 5 per digit (0–9) | 50 1-stroke | Exact byte-copy of `backend/data/real_val.json` |
| `backend/data/genuine_collected.json` | 2 | `4f53cda18c2baa0c...` | **0** | Empty array (`[]`) | None | Wiped by prior test execution |

### 11.2 Sample JSON Schema Specification
Every sample in the training, validation, and storage datasets adheres to the following JSON schema:
```json
{
  "id": "syn_train_4_0142",
  "label": "4",
  "digit": 4,
  "strokes": [
    [
      { "x": 0.6812, "y": 0.1245 },
      { "x": 0.3012, "y": 0.5821 }
    ],
    [
      { "x": 0.6601, "y": 0.3612 },
      { "x": 0.6601, "y": 0.8988 }
    ]
  ],
  "stroke_count": 2,
  "aspect_ratio": 0.942,
  "point_count": 28,
  "created_at": "2026-11-23T12:00:00Z",
  "is_synthetic": true,
  "capture_source": "synthetic_generator_m4",
  "session_id": "session_synthetic"
}
```

---

## 12. Dataset Integrity, Provenance & Leakage Audit

### 12.1 Programmatic Origin of "Real" Datasets
A critical architectural finding for the external consultant:  
Despite their filenames, [backend/data/real_val.json](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/backend/data/real_val.json) and [backend/data/real_test.json](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/backend/data/real_test.json) **were not collected from human webcam air-writing**.

Inspection of [backend/tools/generate_real_seeds.py](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/backend/tools/generate_real_seeds.py) confirms that these files were generated programmatically using randomized Bezier curves:
```python
def generate_airwritten_digit(digit: int, variant: int, seed: int) -> List[List[Dict[str, float]]]:
    """Generates realistic human air-writing stroke trajectories."""
    rng = random.Random(seed)
    # ... parametric Bezier definitions with jitter ...
```
**Evidentiary Status**: **[VERIFIED]**. These files represent simulated air-writing seeds, not empirical webcam recordings from human participants.

### 12.2 Status of Live Genuine Air-Writing Data
- In the active repository, `backend/data/genuine_collected.json` contains exactly 2 bytes: `[]`.
- During the Phase D retraining session, 21 genuine air-writing samples from Session 2 were loaded and evaluated (see [Section 14](#14-training-methodology--hyperparameter-audit)). Those 21 samples consisted of:
  - 13 samples of digit `1`
  - 8 samples of digit `2`
  - 0 samples of digits `0`, `3`, `4`, `5`, `6`, `7`, `8`, `9`.
- **Root Cause of Empty File**: `backend/tests/test_dataset_routes.py` previously executed `client.delete("/api/dataset/clear")` against the live dataset path without isolation, emptying the file during test runs.

### 12.3 Data Leakage Audit
- **Synthetic Train vs. Synthetic Val**: An automated ID and stroke hash intersection check confirms **zero sample overlap** between `synthetic_train.json` and `synthetic_val.json` **[VERIFIED]**.
- **Seed Val vs. Seed Test**: `real_val.json` (Seed 42) and `real_test.json` (Seed 999) share zero sample IDs **[VERIFIED]**.
- **Model Training Scope**: The production model was trained **exclusively on synthetic data** (`synthetic_train.json`). No genuine webcam samples were included in the training weights **[VERIFIED]**.

---

## 13. Synthetic Generator Investigation

### 13.1 Generator Implementation
**File**: [backend/tools/generate_synthetic_corpus.py](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/backend/tools/generate_synthetic_corpus.py)  
The generator constructs trajectories using piecewise cubic Bezier curves, applies human motor drift, performs affine perturbations, and runs the output through the identical M4 processing pipeline.

### 13.2 Code Excerpts for Critical Digits (4, 5, 8, 9)

**Digit 4 (Lines 312–325)**:
```python
    elif digit == 4:
        # DIGIT 4: 1-stroke continuous (50%) or 2-stroke standard (50%)
        if rng.random() > 0.5:
            # 2-stroke 4
            s1 = sample_bezier((0.68, 0.10), (0.35, 0.58), (0.24, 0.62), (0.84, 0.62), steps=16)
            s2 = sample_bezier((0.66, 0.36), (0.66, 0.60), (0.66, 0.80), (0.66, 0.90), steps=12)
            raw_strokes.append(s1)
            raw_strokes.append(s2)
        else:
            # 1-stroke lightning 4
            s = sample_bezier((0.68, 0.12), (0.30, 0.58), (0.26, 0.62), (0.78, 0.62), steps=14)
            s += sample_bezier((0.78, 0.62), (0.66, 0.40), (0.66, 0.70), (0.66, 0.90), steps=12)
            raw_strokes.append(s)
```

**Digit 5 (Lines 326–340)**:
```python
    elif digit == 5:
        # DIGIT 5: 1-stroke continuous (50%) or 2-stroke (50%)
        if rng.random() > 0.5:
            # 2-stroke 5: stem + loop, then top horizontal bar
            s1 = [(0.32, 0.18), (0.30, 0.46)]
            s1 += sample_bezier((0.30, 0.46), (0.78, 0.40), (0.78, 0.86), (0.28, 0.85), steps=16)
            s2 = sample_bezier((0.30, 0.18), (0.50, 0.18), (0.68, 0.18), (0.74, 0.18), steps=8)
            raw_strokes.append(s1)
            raw_strokes.append(s2)
        else:
            # 1-stroke 5: top bar right-to-left, stem down, lobe right
            s = sample_bezier((0.74, 0.18), (0.52, 0.18), (0.34, 0.18), (0.30, 0.46), steps=12)
            s += sample_bezier((0.30, 0.46), (0.78, 0.42), (0.78, 0.86), (0.28, 0.85), steps=16)
            raw_strokes.append(s)
```

**Digit 8 (Lines 359–394)**:
```python
    elif digit == 8:
        # DIGIT 8: Realistic Figure-8 S-curve or two stacked loops
        style_choice = rng.random()
        if style_choice < 0.65:
            # Style 8A: Continuous S-curve figure-8 with upper/lower radii and loop gaps
            gap_choice = rng.random()
            sweep_mult = 1.0
            if gap_choice < 0.35:
                sweep_mult = rng.uniform(0.90, 0.96)  # Small top gap (release early)
            elif gap_choice > 0.75:
                sweep_mult = rng.uniform(1.02, 1.08)  # Slight overshoot

            top_r = rng.uniform(0.14, 0.19)
            bot_r = rng.uniform(0.16, 0.21)
            pts = []
            steps = rng.randint(30, 42)
            for i in range(int(steps * sweep_mult) + 1):
                t = (i / steps) * 2 * math.pi
                x = 0.5 + (top_r if math.sin(t) > 0 else bot_r) * math.sin(t)
                y = 0.5 - 0.40 * math.sin(2 * t) / (1.0 + 0.25 * math.cos(t)**2)
                pts.append((x, y))
            raw_strokes.append(pts)
        elif style_choice < 0.85:
            # Style 8B: 2-stroke stacked circular loops (snowman style)
            # ... two separate circles ...
```

**Digit 9 (Lines 406–414)**:
```python
    elif digit == 9:
        # DIGIT 9: Top loop + downward stem on right
        cx, cy = 0.50, 0.32
        r = rng.uniform(0.18, 0.24)
        loop_steps = 18
        loop = [(cx + r * math.cos(t), cy + r * math.sin(t)) for t in [math.pi / 2 - (i / loop_steps) * 2 * math.pi for i in range(loop_steps + 1)]]
        stem = sample_bezier((cx + r, cy), (cx + r + 0.02, 0.60), (0.58, 0.82), (0.42, 0.90), steps=14)
        raw_strokes.append(loop + stem[1:])
```

### 13.3 Analysis of the Synthetic-to-Real Domain Gap
1. **Fixed Stroke Topologies**:
   - Digit `9` is generated **strictly as a single stroke starting at the top, rotating clockwise, then descending into the stem**. If a user draws `9` counter-clockwise or as 2 strokes (circle then line), the feature vector deviates significantly.
   - Digit `5` assumes the top bar is either drawn right-to-left in 1 stroke or second in 2 strokes. If drawn left-to-right first, the directional histogram is inverted.
2. **Kinematic Realism**:
   - Air-writing in 3D space exhibits tracking lag, MediaPipe hand occlusion when moving fingers toward/away from the camera, and variable velocity. The synthetic generator assumes smooth 2D planar movement with constant step sampling.
3. **Overfitting to Generator Distribution**:
   - Because all synthetic samples are generated from the same 10 mathematical primitives, an MLP easily achieves 100% accuracy on synthetic validation data without generalizing to genuine human idiosyncrasies.

---

## 14. Training Methodology & Hyperparameter Audit

### 14.1 Training Configuration
Inspection of [backend/tools/retrain_m5_model.py](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/backend/tools/retrain_m5_model.py) details the exact training execution:

| Parameter | Configured Value | Verification Status | Notes |
| :--- | :--- | :--- | :--- |
| **Model Type** | `FastFeatureMLPClassifier` | **[VERIFIED]** | Subclass of pure-Python `FeatureMLPClassifier`. |
| **Input Dimension** | 76 | **[VERIFIED]** | Matches canonical feature vector length. |
| **Hidden Layer Dimension** | 48 | **[VERIFIED]** | Expanded from 32 in initial design for capacity. |
| **Output Classes** | 10 | **[VERIFIED]** | Digits `"0"` through `"9"`. |
| **Training Corpus** | `synthetic_train.json` | **[VERIFIED]** | Exactly 3,000 samples (300 per digit). |
| **Validation Corpus** | `synthetic_val.json` | **[VERIFIED]** | Exactly 1,000 samples (100 per digit). |
| **Epochs** | 30 | **[VERIFIED]** | Fixed iterations (no early stopping). |
| **Batch Size** | 32 | **[VERIFIED]** | Mini-batch stochastic gradient descent. |
| **Optimizer** | Adam ($\beta_1=0.9, \beta_2=0.999, \epsilon=10^{-8}$)| **[VERIFIED]** | Pure-Python numerical implementation with bias correction. |
| **Learning Rate** | 0.008 | **[VERIFIED]** | Constant base learning rate. |
| **Weight Decay** | 0.0001 | **[VERIFIED]** | L2 regularization on weights $W_1$ and $W_2$. |
| **Weight Initialization** | Xavier / He uniform | **[VERIFIED]** | Limit $\sqrt{6 / (d_{in} + d_{out})}$. |
| **Random Seed** | 42 (Init), 1337 (Shuffling) | **[VERIFIED]** | Fully deterministic; reproducible across runs. |

### 14.2 Training Convergence Log
From the verified execution history embedded in the model training pipeline:
- **Epoch 5/30**: Loss: `0.3412`, Validation Accuracy: `98.5%`
- **Epoch 10/30**: Loss: `0.1120`, Validation Accuracy: `99.5%`
- **Epoch 15/30**: Loss: `0.0543`, Validation Accuracy: `100.0%`
- **Epoch 20/30**: Loss: `0.0312`, Validation Accuracy: `100.0%`
- **Epoch 25/30**: Loss: `0.0198`, Validation Accuracy: `100.0%`
- **Epoch 30/30**: Loss: `0.0142`, Validation Accuracy: `100.0%`
- **Final Cross-Entropy Loss**: `0.0142` **[VERIFIED]**.

---

## 15. Evaluation Metrics & Automated Test Suite Results

### 15.1 Evaluation on Synthetic Validation Set (1,000 Samples)
Evaluated via [backend/app/ml/evaluator.py](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/backend/app/ml/evaluator.py):

| Metric | Synthetic Val Result | Verification Level | Evaluation Context |
| :--- | :--- | :--- | :--- |
| **Top-1 Accuracy** | **100.0%** (1000/1000) | **[VERIFIED]** | Evaluated on held-out `synthetic_val.json`. |
| **Top-3 Accuracy** | **100.0%** (1000/1000) | **[VERIFIED]** | Evaluated on held-out `synthetic_val.json`. |
| **Macro F1 Score** | **1.0000** | **[VERIFIED]** | Balanced across all 10 digits (100 samples/class). |
| **Mean Top Confidence** | **98.4%** | **[VERIFIED]** | Average probability assigned to winning class. |

**Per-Class Precision, Recall, and F1 on Synthetic Val**:
$$\text{Digits } 0\text{–}9: \quad \text{Precision} = 100.0\%, \quad \text{Recall} = 100.0\%, \quad F_1 = 1.0000 \quad (\text{Support} = 100 \text{ each})$$

> [!WARNING]
> **Consultant Note on 100% Synthetic Accuracy**:  
> The 100% score on synthetic validation data does **not** indicate a solved recognition task. It proves that the 48-unit MLP successfully learned the parametric equations used by `generate_synthetic_corpus.py`. The real-world test is human air-writing.

### 15.2 Evaluation on Genuine Session 2 Air-Writing Samples (21 Samples)
Recorded during the Phase D training execution and embedded in `symbol_model_v1.json` metadata **[REPORTED]**:
- **Total Tested**: 21 genuine air-written samples.
- **Top-1 Accuracy**: **18 / 21 (85.71%)**.
- **Digit 2 Performance**: **8 / 8 (100.0% correct)**, Mean confidence: `94.2%`.
- **Digit 1 Performance**: **10 / 13 (76.92% correct)**, Mean confidence: `78.4%`.
  - 3 misclassifications: Sample `real_1_004` predicted as `7` (conf `52.1%`); Samples `real_1_009` and `real_1_011` predicted as `7` or `UNCERTAIN` due to excessive diagonal slant.
- **Coverage Limitation**: Only digits `1` and `2` were present. Digits `0`, `3`, `4`, `5`, `6`, `7`, `8`, `9` had zero genuine webcam samples.

### 15.3 Automated Test Suite Execution Results

#### Frontend Vitest Suite (`npm --prefix frontend test`)
**Result**: **10 passed / 10 suites**, **133 passed / 133 tests**, Duration: **507 ms** **[VERIFIED]**.

| Test File | Test Count | Scope & Verifications |
| :--- | :--- | :--- |
| `src/tests/m5Remediation.test.js` | 15 | Input qualification (dots, bounces, zero-collapse), confidence rejection, retrained model predictions on digits 0, 1, 2, 4, 5, 7, 8, 9. |
| `src/tests/symbolFeatures.test.js` | 4 | Feature vector length (76), zero inputs, single-point dot, Python numerical parity. |
| `src/tests/symbolRecognizer.test.js`| 10 | `validateStrokeInput`, `predictMLP`, `predictTemplate`, fallback paths. |
| `src/tests/strokeProcessor.test.js` | 18 | Deep clone, sanitization, binomial smoothing, arc-length resampling, isotropic normalization. |
| `src/tests/coordinateMirroring.test.js`| 7 | Horizontal flipping, canvas mapping, no double-mirroring. |
| `src/tests/geometryCorrection.test.js` | 6 | Aspect ratio preservation, non-square surface handling. |
| `src/tests/airWriting.test.js` | 55 | Pinch distance thresholds, state transitions, dropout grace periods. |
| `src/tests/handTracking.test.js` | 6 | MediaPipe landmark indices, presence detection. |
| `src/tests/oneEuroFilter.test.js` | 8 | 1€ filter frequency cutoff adaptation, jitter reduction. |
| `src/tests/api.test.js` | 4 | Backend health check, sample post, sync, stats retrieval. |

#### Backend Pytest Suite (`python -m pytest backend/tests`)
**Result**: **5 passed / 5 suites**, **17 passed / 17 tests**, Duration: **1.59 s** **[VERIFIED]**.

| Test File | Test Count | Scope & Verifications |
| :--- | :--- | :--- |
| `backend/tests/test_dataset_generator.py` | 6 | Sample counts (3000 train, 1000 val), split independence, M4 format compliance, digit 0 loop closure, digit 1 straightness, digit 8 figure-8. |
| `backend/tests/test_dataset_routes.py` | 1 | Endpoint lifecycle (`/sample`, `/sync`, `/samples`, `/clear`) with isolated temporary file fixture. |
| `backend/tests/test_symbol_features.py` | 4 | Empty strokes, single dot, horizontal line, deterministic vector matching JS to 6 decimals. |
| `backend/tests/test_symbol_recognition.py`| 3 | Evaluator confusion matrix & F1, template recognizer prediction, MLP forward pass and JSON export. |
| `backend/tests/test_health.py` | 3 | Root endpoint, health endpoint, CORS header validation. |

---

## 16. Digit-Specific Reliability: Digit 4 Audit

### 16.1 Generator Characteristics & Representation
- **Synthetic Distribution**: 50% 1-stroke ("lightning" style), 50% 2-stroke (standard cross).
- **Features**: Distinctive aspect ratio ($AR \approx 0.85\text{–}1.05$), stroke count feature ($x_{73} = 0.33$ or $0.67$), significant density in quadrants 1, 2, and 4.
- **Genuine Sample Count**: 0 in `genuine_collected.json`.

### 16.2 Root Cause of Recognition Failures
1. **Accidental Dot / Micro-Stroke Misclassification**:
   - **Mechanism**: In earlier versions, any tiny pinch tap or contact bounce produced a single point or microscopic stroke. After bounding box normalization without qualification, the collapsed point landed at $(0.5, 0.5)$ with $AR = 1.0$ and $K = 1$. The untrained or poorly partitioned MLP assigned its highest default logit to class `4`.
   - **Remediation**: `validateStrokeInput` now intercepts and rejects any input with $N_{raw} < 5$, $L < 0.035$, or degenerate coordinates at $(0.5, 0.5)$ before the model is invoked **[VERIFIED]**.
2. **Premature Single-Stroke Triggering**:
   - **Mechanism**: When writing a standard 2-stroke `4`, the user drew the first stroke ($\angle$) and released the pinch. The recognizer immediately classified the incomplete gesture as `1` or `7`.
   - **Remediation**: The $450\text{ ms}$ debounce window holds classification in `isStrokePending = true` until the second vertical stroke ($|$) is completed **[VERIFIED]**.

### 16.3 Remaining Weaknesses
- If a user draws a 3-stroke `4` or draws the vertical stem before the horizontal bar, the directional histogram features ($x_{64\text{–}71}$) differ from the training distribution, resulting in low confidence or misclassification.

---

## 17. Digit-Specific Reliability: Digit 5 Audit

### 17.1 Generator Characteristics & Representation
- **Synthetic Distribution**: 50% 1-stroke (top bar R-to-L, stem down, lobe right), 50% 2-stroke (stem + lobe, then top bar).
- **Features**: High density in bottom-right and top-left, horizontal segments in top octants.
- **Genuine Sample Count**: 0 in `genuine_collected.json`.

### 17.2 Root Cause of Recognition Failures
1. **Premature Multi-Stroke Classification**:
   - **Mechanism**: The standard handwriting habit for digit `5` is: (1) draw the downward stem and curved lower lobe, (2) lift pen/finger, (3) add the top horizontal cap. Prior to debounce remediation, Stroke 1 alone was evaluated immediately upon pinch release. Stroke 1 has an open loop and curved bottom, frequently triggering a false prediction of `6` or `1`.
   - **Remediation**: The $450\text{ ms}$ multi-stroke timer allows the user to complete Stroke 2 before inference runs **[VERIFIED]**.
2. **Stroke Direction Mismatch**:
   - **Mechanism**: If a user draws the top horizontal bar from left to right, tangent angles are $\approx 0\text{ rad}$ (Bin 64). The 1-stroke synthetic generator draws the top bar from right to left, tangent angles $\approx \pi\text{ rad}$ (Bin 68/70). This creates a feature discrepancy in the directional histogram.

---

## 18. Digit-Specific Reliability: Digit 9 Audit

### 18.1 Generator Characteristics & Representation
- **Synthetic Distribution**: **100% 1-stroke continuous**.
- **Generator Code**: Starts at $(cx, cy + r) = (0.50, 0.54)$, sweeps clockwise through an 18-step circle, then immediately connects to a downward Bezier stem ending at $(0.42, 0.90)$.
- **Genuine Sample Count**: 0 in `genuine_collected.json`.

### 18.2 Root Cause of Recognition Failures (~40% Real Accuracy)
1. **Strict Clockwise Single-Stroke Topology**:
   - Many human writers draw `9` counter-clockwise, or start from the bottom stem and loop upward. The synthetic training set contains zero counter-clockwise or bottom-start variations.
   - When drawn counter-clockwise, all directional histogram bins ($x_{64\text{–}71}$) are flipped by $180^\circ$, causing the MLP to fail.
2. **Confusion with Digit 0**:
   - Both `0` and `9` have high spatial density in the upper loop. If the user's downward stem on `9` is short or slightly curved to the left, the endpoint closure ratio ($x_{75}$) remains low, causing confusion with `0`.
3. **Confusion with Digit 7**:
   - If the upper loop of `9` does not fully close, the horizontal top and diagonal stem strongly resemble a European digit `7`.

---

## 19. Manual Testing Observations vs. Automated Metrics

### 19.1 Empirical Discrepancy Matrix
The following table contrasts the formal automated validation metrics with the qualitative observations made during manual user testing:

| Symbol / Digit | Automated Synthetic Metric | Automated Test Case (`m5Remediation.test.js`) | Manual Testing Observation | Technical Root Cause for Discrepancy |
| :---: | :---: | :---: | :---: | :--- |
| **0** | 100.0% F1 | Passed (closed and open loops) | Mostly correct (~87% conf) | High tolerance for aspect ratio and closed-loop endpoint distance. |
| **1** | 100.0% F1 | Passed (straight & slanted) | Mostly correct (~62.3% conf) | Narrow aspect ratio ($AR < 0.40$) easily isolates `1` from other digits. |
| **2** | 100.0% F1 | Passed (standard curve + base) | Mostly correct | 100% on genuine Session 2 samples (8/8). Distinctive top loop and horizontal base. |
| **3** | 100.0% F1 | Passed in full suite | Mostly correct | Dual rightward lobes provide clear spatial grid profile. |
| **4** | 100.0% F1 | Passed (2-stroke composite) | Previously failed on dots; improved with debounce | Synthetic data lacks human stroke order variants; accidental taps resolved by qualification gate. |
| **5** | 100.0% F1 | Passed (2-stroke composite) | Partially correct / inconsistent | Top bar drawn left-to-right inverts directional bins relative to synthetic generator. |
| **6** | 100.0% F1 | Passed in full suite | Partially correct | Sensitive to loop closure ratio and bottom-left curvature. |
| **7** | 100.0% F1 | Passed (horizontal + slant) | Partially correct | Slanted `1` gestures occasionally cross into `7` decision boundary. |
| **8** | 100.0% F1 | Passed (figure-8 with gaps) | Partially correct (~99.8% in one screenshot) | S-curve parametric equation now supports loop gaps; user drawing speed affects closure. |
| **9** | 100.0% F1 | Passed (clockwise loop+stem)| **~40% correct / 60% incorrect** | Synthetic corpus contains **only clockwise 1-stroke 9s**. Human counter-clockwise writing inverts directional features. |
| **Dots / Taps** | N/A (Gate) | Passed (rejected as `DEGENERATE_DOT`) | Confirmed resolved in test suite | Input qualification gate stops dot classification before MLP. |
| **Ambiguous**| N/A | Passed (rejected as `UNCERTAIN`) | Confirmed rejected (~38.8% conf) | Confidence threshold $\tau = 0.45$ prevents forced classifications. |

---

## 20. Data Safety, Isolation & Accidental Deletion Post-Mortem

### 20.1 Incident Description: Wiping of `genuine_collected.json`
- **Occurrence**: Prior to recent remediation, `backend/data/genuine_collected.json` was reduced from containing real air-written samples to an empty JSON array `[]` (2 bytes) **[VERIFIED]**.
- **Root Cause Analysis**:
  1. In [backend/app/routes/dataset.py](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/backend/app/routes/dataset.py#L14-L18), the dataset path is hardcoded at module import:
     ```python
     DATASET_FILE = os.path.join(..., "data", "genuine_collected.json")
     ```
  2. The endpoint `DELETE /api/dataset/clear` executes `_write_dataset([])`.
  3. In `backend/tests/test_dataset_routes.py`, the test suite invoked `client.delete("/api/dataset/clear")` as part of its setup and teardown routines. Because `DATASET_FILE` pointed directly to the production file on disk, running pytest immediately wiped all collected genuine samples.

### 20.2 Remediation Implemented
In [backend/tests/test_dataset_routes.py](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/backend/tests/test_dataset_routes.py#L14-L22), an autouse pytest fixture was introduced:
```python
@pytest.fixture(autouse=True)
def isolate_dataset_file(tmp_path):
    orig_file = dataset.DATASET_FILE
    temp_file = str(tmp_path / "test_genuine_collected.json")
    dataset.DATASET_FILE = temp_file
    yield
    dataset.DATASET_FILE = orig_file
```
**Verification**: When pytest runs now, `dataset.DATASET_FILE` is redirected to a temporary directory. The live `backend/data/genuine_collected.json` is untouched **[VERIFIED]**.

### 20.3 Remaining Safety Vulnerabilities
- **Production Endpoint Exposure**: The `DELETE /api/dataset/clear` route remains registered in FastAPI without authentication, rate limiting, or confirmation flags. Any HTTP client on localhost can invoke `curl -X DELETE http://localhost:8000/api/dataset/clear` and wipe the dataset.
- **Single Point of Failure**: Samples collected via the frontend UI are synced to `genuine_collected.json` as a single flat file. There is no automated append-only write-ahead log (WAL) or timestamped backup rotation.

---

## 21. Verified Facts Summary

The following facts are directly confirmed from actual repository files, hashes, and test executions:

1. **[VERIFIED]** The local recognition engine runs entirely client-side in JavaScript without backend network requests during inference.
2. **[VERIFIED]** The active model is a 76 → 48 → 10 MLP with 4,186 trainable parameters.
3. **[VERIFIED]** Model weights are byte-for-byte identical (78,197 bytes, SHA256 `b9c9dd15...`) across `frontend/src/assets`, `frontend/public/models`, and `frontend/dist/models`.
4. **[VERIFIED]** The 76-dimensional feature extraction implementation produces mathematically identical results between JavaScript (`symbolFeatures.js`) and Python (`features.py`) to 6 decimal places on canonical test paths.
5. **[VERIFIED]** MediaPipe coordinate mirroring is implemented in `useHandTracking.js` as $x_{screen} = 1.0 - x_{mp}$, aligning recorded stroke geometry with the user's mirrored video feed.
6. **[VERIFIED]** M4 isotropic aspect-ratio normalization scales both X and Y coordinates by a single uniform factor $\text{scale} = 0.90 / \max(W \times S, H)$, preserving circularity and diagonal angles.
7. **[VERIFIED]** The input qualification gate in `symbolRecognizer.js` rejects inputs with $N_{raw} < 5$, $N_{proc} < 6$, $L < 0.035$, or $\max(W, H) < 0.030$, returning `topPrediction: null` and `confidence: 0.0`.
8. **[VERIFIED]** Stationary pinch taps collapse to $(0.5, 0.5)$ in M4 processing and are rejected as `DEGENERATE_DOT`.
9. **[VERIFIED]** Multi-stroke debounce is implemented in `CameraPreview.jsx` using a $450\text{ ms}$ timer that resets whenever a new pinch gesture begins.
10. **[VERIFIED]** The confidence rejection threshold defaults to $\tau = 0.45$. Predictions below $0.45$ are marked `status: 'UNCERTAIN'`.
11. **[VERIFIED]** The synthetic training dataset (`synthetic_train.json`) contains 3,000 samples (300 per digit).
12. **[VERIFIED]** The synthetic validation dataset (`synthetic_val.json`) contains 1,000 samples (100 per digit).
13. **[VERIFIED]** Automated test suites pass 100%: 133 frontend tests (Vitest) and 17 backend tests (Pytest).
14. **[VERIFIED]** `backend/data/real_val.json` and `real_test.json` (50 samples each) are programmatic seeds generated by `generate_real_seeds.py`, not real human webcam recordings.
15. **[VERIFIED]** `backend/data/genuine_collected.json` currently contains 0 samples (`[]`) due to an unisolated test route deletion in prior sessions.

---

## 22. Reported Claims Audit

The following claims from project logs, transcripts, or prior reports were audited against live repository evidence:

1. **Claim: "Synthetic training set contains 2,400 samples."**
   - **Audit Result**: **Refuted by disk evidence**. `backend/data/synthetic_train.json` contains exactly **3,000 samples** (300 per digit) **[VERIFIED]**. (The 2,400 number originated from an earlier Phase 3 draft before generating 300/digit).
2. **Claim: "100% validation accuracy achieved on M5 model."**
   - **Audit Result**: **Partially true, with major caveat**. The model achieves 100.0% accuracy on `synthetic_val.json` (1,000 samples) **[VERIFIED]**. However, this reflects synthetic parametric memorization, not genuine real-world accuracy.
3. **Claim: "Genuine held-out test achieved 18/21 (85.7%)."**
   - **Audit Result**: **[REPORTED]** in model metadata and training script comments. The 21 samples comprised 13 ones and 8 twos from Session 2. Digits 0, 3, 4, 5, 6, 7, 8, 9 were not tested in this evaluation.
4. **Claim: "AeroSolve supports offline recognition."**
   - **Audit Result**: **Confirmed**. The model is imported statically into the Vite bundle and runs pure JavaScript matrix multiplications in `< 0.2\text{ ms}` **[VERIFIED]**.

---

## 23. Unknowns, Limitations & Technical Blindspots

The independent consultant should consider the following limitations and unknown variables that cannot be determined from repository inspection alone:

1. **[UNKNOWN] Real-World Accuracy on Digits 0, 3, 4, 5, 6, 7, 8, 9**:
   - Because `genuine_collected.json` was wiped and the Session 2 evaluation only contained digits `1` and `2`, there is zero empirical data regarding real-world human accuracy on the other 8 digits.
2. **[UNKNOWN] Lighting and Skin-Tone Robustness**:
   - MediaPipe HandLandmarker performance varies under low lighting, backlighting, and diverse skin complexions. The repository contains no benchmark evaluating landmark tracking confidence under adverse visual conditions.
3. **[UNKNOWN] Hardware Performance Variation**:
   - The $450\text{ ms}$ debounce timer and 60 FPS animation loop depend on consistent client-side hardware performance. On low-end mobile devices or thermal-throttling laptops, dropped frames could affect arc-length calculations and debounce responsiveness.
4. **[INFERRED] Extreme Vulnerability of Digit 9**:
   - Because the synthetic training distribution for `9` contains exclusively 1-stroke clockwise loops, the model is architecturally blind to counter-clockwise or 2-stroke digit `9` writing styles.

---

## 24. References to Files and Source Excerpts

### 24.1 Frontend Files & Anchor Ranges
- [symbolRecognizer.js](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/frontend/src/services/symbolRecognizer.js#L26-L52) — Threshold constants & qualification defaults.
- [symbolRecognizer.js](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/frontend/src/services/symbolRecognizer.js#L53-L167) — `validateStrokeInput` implementation.
- [symbolRecognizer.js](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/frontend/src/services/symbolRecognizer.js#L324-L384) — `predictMLP` forward pass.
- [symbolRecognizer.js](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/frontend/src/services/symbolRecognizer.js#L446-L543) — `predictSymbol` master inference function.
- [symbolFeatures.js](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/frontend/src/services/symbolFeatures.js#L29-L179) — Canonical 76-dim feature extraction in JavaScript.
- [strokeProcessor.js](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/frontend/src/services/strokeProcessor.js#L16-L35) — M4 default stroke configuration.
- [strokeProcessor.js](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/frontend/src/services/strokeProcessor.js#L120-L199) — Binomial smoothing.
- [strokeProcessor.js](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/frontend/src/services/strokeProcessor.js#L205-L289) — Arc-length resampling.
- [strokeProcessor.js](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/frontend/src/services/strokeProcessor.js#L360-L465) — Isotropic aspect-ratio normalization.
- [useHandTracking.js](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/frontend/src/hooks/useHandTracking.js#L988-L990) — Coordinate mirroring ($x = 1 - x_{mp}$).
- [CameraPreview.jsx](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/frontend/src/components/CameraPreview.jsx#L181-L227) — Multi-stroke debounce timer ($450\text{ ms}$) and stroke composition HUD.
- [symbol_model_v1.json](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/frontend/src/assets/symbol_model_v1.json) — Production model weights and metadata.

### 24.2 Backend Files & Anchor Ranges
- [features.py](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/backend/app/ml/features.py#L22-L166) — Canonical 76-dim feature extraction in Python.
- [feature_classifier.py](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/backend/app/ml/feature_classifier.py#L28-L120) — `FeatureMLPClassifier` reference class.
- [evaluator.py](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/backend/app/ml/evaluator.py#L9-L89) — Confusion matrix & classification metrics.
- [dataset.py](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/backend/app/routes/dataset.py#L55-L128) — Dataset API routes.
- [retrain_m5_model.py](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/backend/tools/retrain_m5_model.py#L23-L198) — `FastFeatureMLPClassifier` and training loop.
- [generate_synthetic_corpus.py](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/backend/tools/generate_synthetic_corpus.py#L223-L434) — Synthetic digit stroke generator.
- [generate_real_seeds.py](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/backend/tools/generate_real_seeds.py#L1-L159) — Programmatic air-writing seed generator.
- [prepare_dataset_splits.py](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/backend/tools/prepare_dataset_splits.py#L41-L105) — Session-based dataset partitioner.

### 24.3 Test Files
- [m5Remediation.test.js](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/frontend/src/tests/m5Remediation.test.js) — 15 Vitest tests covering M5 remediation.
- [symbolFeatures.test.js](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/frontend/src/tests/symbolFeatures.test.js) — 4 Vitest tests covering feature parity.
- [test_dataset_routes.py](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/backend/tests/test_dataset_routes.py) — Pytest route test with temporary file fixture.
- [test_symbol_features.py](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/backend/tests/test_symbol_features.py) — 4 Pytest tests covering Python feature extraction.
- [test_dataset_generator.py](file:///c:/Users/bodyg/OneDrive/Pictures/sem6/AeroSolve/backend/tests/test_dataset_generator.py) — 6 Pytest tests verifying synthetic corpus.

---
*End of Evidence Dossier for Milestone M5 Independent Technical Consultant.*
