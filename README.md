# AeroSolve — Milestone 4: Stroke Processing

AeroSolve is an AI-powered air-writing mathematics learning application. This repository contains **Milestone 4 (M4): Stroke Processing**, building on the foundational architecture (M1), real-time MediaPipe hand tracking (M2), and air-writing pinch interaction (M3) to convert raw air-writing strokes into clean, smoothed, resampled, and aspect-ratio-normalized digital ink data ready for downstream handwriting recognition.

---

## 1. Technology Stack

- **Frontend**:
  - React 19
  - Vite 8
  - Google MediaPipe Tasks Vision (`@mediapipe/tasks-vision` v1.2.3)
  - One Euro Filter (Temporal adaptive jitter filtering for 21 hand landmarks)
  - Modular Stroke Processing Pipeline (Sanitization, Binomial Smoothing, Arc-Length Resampling, Aspect-Ratio Normalization)
  - HTML5 Video & Dual HTML5 Canvas Architecture (Persistent Ink Layer + Real-Time Overlay Layer + M4 Normalized Inspector)
  - Vitest (312 automated unit, algorithm, and integration tests across 16 test suites)
  - Oxlint (High-speed JavaScript/JSX static analysis)
- **Backend**:
  - Python 3.10+ (tested on Python 3.15)
  - FastAPI 0.163
  - Uvicorn (ASGI server)
  - Pydantic v2
  - Pytest & HTTPX (Backend integration testing)

---

## 2. Milestone 4 Architecture & Stroke Processing Pipeline

The M4 pipeline converts noisy, irregularly spaced raw air-writing strokes into standardized, high-quality digital ink data. It operates as a pure functional pipeline with a strict **immutability guarantee**—raw stroke data is preserved separately and never mutated.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Raw Air-Writing Strokes                         │
│       Array<Array<{x, y, t}>> from Index Fingertip Pinch Actions       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Stage 1: Deep Clone & Input Sanitization                               │
│ • Deep clones all coordinates to guarantee raw input immutability      │
│ • Filters invalid coordinates (NaN, Infinity, null, undefined)         │
│ • Deduplicates consecutive points within epsilon threshold             │
│ • Preserves legitimate single-point dots (e.g. dot of 'i', decimals)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Stage 2: Noise & Jitter Reduction (Weighted Binomial Smoothing)        │
│ • Applies symmetric 3-point binomial Gaussian kernel [0.25, 0.50, 0.25]│
│ • Configurable smoothing passes (default: 2 iterations)                │
│ • Strict endpoint preservation (stroke start and end remain anchored)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Stage 3: Equidistant Arc-Length Point Resampling                       │
│ • Computes accurate cumulative polyline arc-length                     │
│ • Resamples stroke with uniform spatial spacing (mode: 'spacing',      │
│   e.g. 0.015) or fixed point count (mode: 'count', e.g. 32 points)     │
│ • Eliminates hand speed artifacts (point clustering during slow motion │
│   and point sparsity during fast flicks)                               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Stage 4: Aspect-Ratio Preserving Normalization                         │
│ • Computes global bounding box across all strokes in expression        │
│ • Applies unified isotropic scale factor:                              │
│     scale = (1 - 2 * padding) / max(width, height)                     │
│ • Strictly preserves geometry: minus signs stay flat, fractions retain │
│   vertical hierarchy, square roots and plus signs do not warp         │
│ • Centers expression within normalized unit box [0, 1] × [0, 1]        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Output Data Package & Visualization Modes                              │
│ • In-Situ Strokes: Rendered at user's hand location on camera canvas   │
│ • Normalized Strokes: Standardized [0, 1] coordinates for ML models    │
│ • Metadata: Bounding box, aspect ratio, point reduction %, latency     │
│ • Modes: Raw, Processed, or Live Comparison (dashed vs solid with nodes)│
└────────────────────────────────────────────────────────────────────────┘
```

### Pure Functional Pipeline & Immutability Guarantee
Raw strokes captured during air-writing are never overwritten or mutated. `cloneStrokes()` performs a deep clone of all point objects prior to processing, guaranteeing that raw coordinates remain intact for auditing, comparison, and alternative processing strategies.

### Aspect Ratio Preservation for Mathematical Expressions
Standard bounding-box normalization independently maps $X$ and $Y$ to $[0, 1]$, which deforms mathematical symbols (e.g., stretching a flat minus sign `"-"` or horizontal fraction bar into a square box). AeroSolve uses a single unified scale factor:

$$\text{usableDim} = 1.0 - 2 \times \text{padding}$$
$$\text{scale} = \frac{\text{usableDim}}{\max(\text{width}, \text{height})}$$

This ensures:
- Minus signs (`-`) remain wide and flat.
- Digit `1` and vertical bars (`|`) remain tall and slender.
- Plus signs (`+`) retain equal horizontal and vertical arm lengths.
- Multi-stroke fractions ($\frac{1}{2}$) retain the numerator strictly above the fraction bar and the denominator strictly below.

### Live Canvas Rendering Modes
1. **Raw Mode**: Displays unmodified, raw stroke coordinates directly as captured by MediaPipe.
2. **Processed Mode**: Displays in-situ smoothed and resampled strokes with uniform point spacing and eliminated tremor.
3. **Comparison Mode**: Renders raw strokes as faint dashed slate lines ($2\text{px}$) beneath glowing cyan processed strokes ($4\text{px}$) with white vertex nodes, giving immediate visual feedback on jitter reduction and point resampling.

### M4 Normalized Stroke Inspector
A built-in inspection panel provides:
- A square canvas rendering of the normalized $[0, 1] \times [0, 1]$ unit box with bounding box outlines and grid lines.
- Distinct color-coding per stroke (Stroke 1: Cyan, Stroke 2: Purple, Stroke 3: Amber, Stroke 4: Emerald) to visually verify temporal stroke order preservation.
- Green start nodes and red end nodes indicating stroke direction.
- Geometry metrics (Stroke count, raw vs resampled points, jitter reduction %, aspect ratio, bounding box, processing latency $< 1\text{ms}$).
- Formatted JSON export with a one-click **"Copy JSON"** button to inspect the standardized payload ready for Milestone 5 handwriting recognition.

---

## 3. Project Structure

```text
AeroSolve/
├── frontend/
│   ├── public/
│   │   ├── models/
│   │   │   ├── README.md               # Model asset documentation & Apache 2.0 license
│   │   │   └── hand_landmarker.task    # Google MediaPipe float16 model
│   │   ├── wasm/                       # Local MediaPipe vision WASM binaries
│   │   ├── favicon.svg
│   │   └── icons.svg
│   ├── src/
│   │   ├── components/
│   │   │   ├── BackendStatus.jsx       # Real-time backend status and retry
│   │   │   ├── CameraPreview.jsx       # Viewport, dual canvas, M4 render modes & Inspector
│   │   │   └── Header.jsx              # Branding & Milestone 4 badge
│   │   ├── hooks/
│   │   │   └── useHandTracking.js      # Air-writing loop, stroke management & M4 integration
│   │   ├── services/
│   │   │   ├── airWriting.js           # Hysteresis math, distance, stroke rendering algorithms
│   │   │   ├── api.js                  # API client for backend health
│   │   │   ├── expressionEvaluator.js  # M6.2: AST Evaluator & Step-by-Step Reduction Engine
│   │   │   ├── expressionParser.js     # M6.1: Recursive-descent parser & AST generation
│   │   │   ├── handTracking.js         # MediaPipe HandLandmarker singleton service
│   │   │   ├── oneEuroFilter.js        # One Euro Filter adaptive temporal smoothing
│   │   │   ├── solutionVerifier.js     # M6.3: Solution Verification & Subtree Reduction Engine
│   │   │   ├── strokeProcessor.js      # M4 Modular Pipeline: Smooth, Resample, Normalize
│   │   │   ├── symbolFeatures.js       # M5: 76-dimensional stroke feature extraction
│   │   │   └── symbolRecognizer.js     # M5: Local MLP inference & qualification gate
│   │   ├── tests/
│   │   │   ├── airWriting.test.js      # Unit tests for hysteresis, strokes & tracking loss
│   │   │   ├── api.test.js             # API service unit tests
│   │   │   ├── candidateModelV2.test.js# Validation tests for experimental Model V2
│   │   │   ├── coordinateMirroring.test.js # Webcam coordinate alignment tests
│   │   │   ├── expressionEvaluator.test.js # M6.2: AST evaluation, reduction steps & precision tests
│   │   │   ├── expressionParser.test.js# M6.1: Parser, precedence, AST & error tests
│   │   │   ├── geometryCorrection.test.js  # Aspect ratio and bounding box geometry tests
│   │   │   ├── handTracking.test.js    # Landmark topology & coordinate mapping tests
│   │   │   ├── m5Remediation.test.js   # Multi-stroke qualification safety tests
│   │   │   ├── oneEuroFilter.test.js   # One Euro Filter mathematical tests
│   │   │   ├── qualificationEndToEnd.test.js # End-to-end qualification tests
│   │   │   ├── solutionVerifier.test.js# M6.3: Answer, equation & step reduction verification tests
│   │   │   ├── strokeProcessor.test.js # M4 Pipeline tests: smoothing, resampling, geometry
│   │   │   ├── symbolFeatures.test.js  # Feature extraction consistency tests
│   │   │   └── symbolRecognizer.test.js# Local MLP inference & rejection tests
│   │   ├── App.css                     # Responsive styling, dual-canvas, M4 Inspector styling
│   │   ├── App.jsx                     # Layout composition & M4 architecture cards
│   │   ├── index.css                   # Global theme tokens
│   │   └── main.jsx                    # React entry point
│   ├── .env                            # Local frontend environment config
│   ├── package.json
│   └── vite.config.js
│
├── backend/
│   ├── app/
│   │   ├── routes/
│   │   │   └── health.py               # GET /api/health handler
│   │   └── main.py                     # FastAPI app & CORS configuration
│   ├── tests/
│   │   └── test_health.py              # Automated pytest suite
│   ├── pytest.ini
│   ├── requirements.txt
│   └── .env
│
├── .gitignore
└── README.md
```

---

## 4. Running AeroSolve Locally

### Terminal 1 — Start Backend:
```powershell
cd c:\Users\bodyg\OneDrive\Pictures\sem6\AeroSolve\backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
- Backend URL: `http://127.0.0.1:8000`
- Health check: `http://127.0.0.1:8000/api/health`

### Terminal 2 — Start Frontend:
```powershell
cd c:\Users\bodyg\OneDrive\Pictures\sem6\AeroSolve\frontend
npm run dev
```
- Open [http://localhost:5173](http://localhost:5173) in Google Chrome, Microsoft Edge, Firefox, or Safari.

---

## 5. Automated Verification

Run both test suites to verify system integrity:

```powershell
# Frontend automated tests (277 tests via Vitest across 15 test suites)
cd frontend
npm test

# Frontend static analysis (oxlint) & production build
npm run lint
npm run build

# Backend automated tests (pytest)
cd ../backend
.\.venv\Scripts\pytest.exe -v
```

---

## 6. Manual Testing Instructions (Milestone 4)

Follow these verification tests to validate Milestone 4 Stroke Processing:

### Test 1 — In-Situ Render Modes (Raw vs. Processed vs. Compare)
1. Open [http://localhost:5173](http://localhost:5173) and click **"Start Camera"**.
2. Pinch your index finger and thumb together and write a curve or digit (e.g. `3`).
3. Release the pinch.
4. In the controls bar, click **"Raw"**:
   - The canvas displays the raw, unfiltered air-writing stroke with natural hand tremor.
5. Click **"Processed"**:
   - The stroke instantly updates to the smoothed, resampled ink line. Jitter is eliminated while curves and endpoints remain faithful.
6. Click **"Compare"**:
   - The canvas simultaneously displays:
     - Faint dashed slate line ($2\text{px}$): Raw motion path.
     - Solid glowing cyan line ($4\text{px}$) with white circular nodes: Resampled path with uniform arc-length spacing.

### Test 2 — Multi-Stroke Mathematical Symbol Geometry
1. Draw a horizontal minus stroke `-`.
2. Release pinch and move down.
3. Draw a vertical bar `|` through the center to form a plus `+`.
4. Click **"Inspect M4"** in the controls bar:
   - The inspector panel opens below the video feed.
   - The normalized canvas renders Stroke 1 in cyan and Stroke 2 in purple.
   - The two strokes intersect cleanly with equal arm proportions, confirming isotropic aspect-ratio scaling.

### Test 3 — Multi-Stroke Mathematical Expression Hierarchy (Fraction)
1. Draw a digit `1` in the upper half of the frame.
2. Draw a horizontal fraction bar `—` below the `1`.
3. Draw a digit `2` below the fraction bar.
4. Inspect the Normalized Canvas:
   - Numerator `1` is positioned strictly above the fraction bar.
   - Denominator `2` is positioned strictly below the fraction bar.
   - The global bounding box encapsulates the entire mathematical expression, preserving relative vertical hierarchy.

### Test 4 — Single-Point Dot Preservation (Decimals / Dot of 'i')
1. Tap your thumb and index finger together briefly in the air to create a stationary dot (e.g. for a decimal point `3.14`).
2. Release the pinch.
3. Confirm that the dot appears as a crisp circular point on both the drawing canvas and the normalized inspector.
4. Resampling safely handles the zero-length dot without division-by-zero errors or distortion.

### Test 5 — Raw Stroke Immutability
1. Draw several strokes.
2. In the Stroke Inspector, toggle between **"Normalized JSON"** and **"Raw Stroke JSON"**.
3. Verify that the raw stroke coordinates retain their original floating-point values and point counts, proving that pipeline passes operate purely functionally on cloned data.

### Test 6 — Inspector Telemetry & JSON Export
1. Draw a mathematical symbol (e.g. `x = 7`).
2. Open the Stroke Inspector:
   - Check the **Points (Raw → Clean)** metric: shows substantial point reduction (typically 40%–60% reduction) due to uniform arc-length resampling.
   - Check **Aspect Ratio (W/H)**: confirms calculated aspect ratio.
   - Check **Pipeline Latency**: executes in $< 1\text{ms}$.
3. Click **"Copy JSON"**:
   - Button briefly flashes `✓ Copied!`.
   - Paste the clipboard contents into an editor to verify standard normalized JSON output ready for handwriting recognition models.

### Test 7 — Camera Lifecycle & Clear Writing Persistence
1. With strokes drawn on canvas, click **"Stop Camera"**:
   - Video stops, but all processed strokes remain visible on screen.
   - Stroke Inspector remains fully interactive.
2. Click **"Clear Writing"**:
   - Canvas and Inspector reset to 0 strokes and empty bounding boxes.

---

## 7. Project Roadmap & Milestone Status

AeroSolve follows a staged milestone development roadmap:

1. **Milestone 1 (M1) — Foundational Architecture**: Python FastAPI backend, React 19 + Vite frontend, health routes, build tooling. `[COMPLETED]`
2. **Milestone 2 (M2) — Hand Tracking & Pose Estimation**: Google MediaPipe vision pipeline, landmark tracking, One Euro Filter temporal smoothing. `[COMPLETED]`
3. **Milestone 3 (M3) — Pinch-Based Air-Writing**: Index fingertip pinch hysteresis state machine, dual-canvas persistent ink drawing. `[COMPLETED]`
4. **Milestone 4 (M4) — Stroke Processing Pipeline**: Input sanitization, weighted binomial smoothing, equidistant arc-length resampling, aspect-ratio preserving normalization. `[COMPLETED]`
5. **Milestone 5 (M5) — Local Symbol Recognition (Digits 0–9)**: Local offline MLP feature classifier (76-dimensional feature vector), dataset storage safeguards, pre-normalization input qualification gate, calibrated synthetic corpus generation, and Phase 6 human webcam validation. `[COMPLETED / CLOSED FOR PROTOTYPE]`
   - **Phase 6 Human Validation Results**: 458 total manual air-writing trials (V1 Baseline: 57.2%, V2 Candidate: 66.6%).
   - **Production Model**: Production Model V1 is preserved and remains the active default model; Candidate V2 is accessible via the UI model switcher.
   - **Deferral Notice**: Further model optimization and accuracy tuning for challenging digits (4, 5, 7) are formally deferred to a future dedicated improvement phase.
6. **Milestone 6 (M6) — Step-by-Step Mathematical Solver & Verification**:
   - **Milestone 6.1 — Mathematical Expression Parser**: Standalone deterministic recursive-descent lexer and parser converting recognized mathematical tokens/strings into a structured Abstract Syntax Tree (AST), enforcing operator precedence (`*`, `/` over `+`, `-`), left-associativity, parentheses grouping, and input-level multi-digit integer grouping without numerical evaluation. `[COMPLETED]`
   - **Milestone 6.2 — AST Evaluation & Step-by-Step Reduction Engine**: Standalone deterministic AST evaluator traversing parsed expressions to compute mathematical results while recording structured intermediate reduction steps, enforcing strict zero-division guards, explicit non-finite handling, and preserving raw numerical precision while cleaning IEEE-754 representation noise for display. `[COMPLETED]`
   - **Milestone 6.3 — Solution Verification Engine**: Standalone deterministic mathematical verification engine featuring structural AST subexpression reduction matching (`matchSubtreeReduction`), multi-step reduction sequence validation, value-invariance checking, alternative reduction order and multi-reduction support, formal numerical tolerance comparison, and conservative heuristic misconception diagnostics. `[COMPLETED]`
   - **Milestone 6.4 — Solver & Verifier UI Integration**: Interactive Air-Writing Expression Assembly Workspace, append-to-end token ribbon, operator toolstrip, live reactive syntax readiness validation (`EMPTY`, `READY`, `INCOMPLETE`, `SYNTAX_ERROR`), step-by-step reduction drawer with subexpression rewrites, strict Solver vs. Practice Mode state isolation, independent Candidate Answer Buffer with multi-digit air-writing accumulation, sign/decimal modifiers, M6.3 deterministic verification integration, and strict anti-spoiler feedback policy. `[COMPLETED]`
7. **Milestone 7 (M7) — AI Tutoring & Contextual Feedback**: LLM educational feedback, student error diagnosis, and interactive guidance. `[FUTURE]`

---

## 8. Scope Boundaries

Per project roadmap specifications:
- **Milestone 5 (Symbol Recognition)** is closed for the current prototype phase.
- **Milestone 6 (Mathematical Solving, Verification & UI Integration)** is completed and verified across sub-milestones 6.1, 6.2, 6.3, and 6.4 without modifying M1–M4 pipelines or M5 models.
- **Milestone 7 (AI Tutoring)** is strictly reserved for future conversational LLM guidance and requires explicit planning approval before implementation.
