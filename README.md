# AeroSolve — Milestone 3: Air-Writing Interaction

AeroSolve is an AI-powered air-writing mathematics learning application. This repository contains **Milestone 3 (M3): Air-Writing Interaction**, building on the foundational architecture (M1) and real-time MediaPipe hand tracking (M2) to enable fluid in-air writing controlled by an intuitive pinch gesture.

---

## 1. Technology Stack

- **Frontend**:
  - React 19
  - Vite 8
  - Google MediaPipe Tasks Vision (`@mediapipe/tasks-vision` v1.2.3)
  - HTML5 Video & Dual HTML5 Canvas Architecture (Ink Layer + Overlay Layer)
  - Vitest (Frontend unit & algorithm testing)
- **Backend**:
  - Python 3.10+ (tested on Python 3.15)
  - FastAPI 0.163
  - Uvicorn (ASGI server)
  - Pydantic v2
  - Pytest & HTTPX (Backend integration testing)

---

## 2. Milestone 3 Architecture & Air-Writing Interaction

### Dual-Canvas Layered Viewport
The AeroSolve viewport employs a decoupled, 3-layer rendering stack:

```text
┌────────────────────────────────────────────────────────┐
│  Layer 3: Tracking Overlay Canvas (Z-Index: 15)        │
│  • 60 FPS animation loop (cleared every frame)         │
│  • Pulsing fingertip reticle (cyan when ready, emerald │
│    when drawing)                                       │
│  • Pinch proximity guide line between thumb and index  │
│  • Optional 21-node hand skeleton                      │
├────────────────────────────────────────────────────────┤
│  Layer 2: Persistent Air-Writing Canvas (Z-Index: 12)  │
│  • Holds completed and active ink strokes              │
│  • Only rendered when new stroke segments are drawn or │
│    during window resizing                              │
│  • Preserves written strokes across camera pauses      │
├────────────────────────────────────────────────────────┤
│  Layer 1: Native HTML5 Video Element                   │
│  • Raw camera feed mirrored via CSS transform scaleX(-1)│
└────────────────────────────────────────────────────────┘
```

### Pinch Gesture Detection with Dual-Threshold Hysteresis
To control when ink flows without relying on physical buttons or awkward poses, AeroSolve computes the 3D Euclidean distance between the **Thumb Tip (Landmark #4)** and **Index Fingertip (Landmark #8)**:

$$d = \sqrt{(x_8 - x_4)^2 + (y_8 - y_4)^2 + (z_8 - z_4)^2}$$

To eliminate high-frequency chatter or flickering at the threshold boundary, **hysteresis** is applied:
- **Pinch Activation Threshold**: $d \le 0.065$. When an open hand pinches thumb and index finger together, drawing immediately activates and a new stroke begins.
- **Pinch Release Threshold**: $d \ge 0.085$. Once drawing has begun, the stroke remains active until the fingers deliberately separate beyond $0.085$.
- **Hysteresis Gap ($0.065 < d < 0.085$)**: The system preserves the previous state, ensuring smooth, uninterrupted strokes even during slight finger tremor.

### Coordinate Transformation & Mirror Alignment
The `<video>` is mirrored (`scaleX(-1)`) so moving your hand rightward moves the on-screen image rightward (natural mirror).
The drawing and tracking canvases remain unmirrored to ensure HUD text, tooltips, and stroke curves maintain correct orientation:

$$x_{\text{canvas}} = (1 - x_{\text{norm}}) \times \text{canvasWidth}$$
$$y_{\text{canvas}} = y_{\text{norm}} \times \text{canvasHeight}$$

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
│   │   │   ├── CameraPreview.jsx       # Viewport, dual canvas, and air-writing controls
│   │   │   └── Header.jsx              # Branding & Milestone 3 badge
│   │   ├── hooks/
│   │   │   └── useHandTracking.js      # Air-writing loop, stroke management & 60 FPS drawing
│   │   ├── services/
│   │   │   ├── airWriting.js           # Hysteresis math, distance, stroke rendering algorithms
│   │   │   ├── api.js                  # API client for backend health
│   │   │   └── handTracking.js         # MediaPipe HandLandmarker singleton service
│   │   ├── tests/
│   │   │   ├── airWriting.test.js      # Unit tests for hysteresis, strokes & tracking loss
│   │   │   ├── api.test.js             # API service unit tests
│   │   │   └── handTracking.test.js    # Landmark topology & coordinate mapping tests
│   │   ├── App.css                     # Responsive styling, dual-canvas & reticle styling
│   │   ├── App.jsx                     # Layout composition
│   │   ├── index.css                   # Global theme tokens
│   │   └── main.jsx                    # React entry point
│   ├── .env                            # Local frontend environment config
│   ├── .env.example
│   ├── index.html
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
# Frontend automated tests (22 tests via Vitest)
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

## 6. Manual Testing Instructions (Milestone 3)

Follow these verification tests to validate Milestone 3 Air-Writing:

### Test 1 — Open Hand (Ready State)
1. Open [http://localhost:5173](http://localhost:5173).
2. Click **"Start Camera"**.
3. Raise your hand with open fingers in front of the lens.
4. **Expected Result**:
   - Status badge shows blue: **Ready (Pinch to Write)**.
   - Index fingertip has a blue/cyan reticle with tooltip `INDEX TIP (READY)`.
   - A subtle proximity line appears between thumb and index finger.
   - No ink is drawn on the canvas.

### Test 2 — Pinch-to-Write (Drawing State)
1. Bring your thumb tip and index fingertip together until they touch.
2. **Expected Result**:
   - Status badge switches to emerald green: **● Drawing**.
   - The fingertip reticle turns vibrant green with an expanding ink-pulse aura and tooltip `● DRAWING ACTIVE`.
   - The connection line between thumb and index turns solid green.
   - A bright cyan ink stroke begins drawing directly beneath your index fingertip.
3. Move your hand to write a number (e.g. `2`).
4. Separate your thumb and index finger.
5. **Expected Result**:
   - Drawing ceases cleanly.
   - The stroke `2` remains crisply drawn on the screen.
   - The stroke counter updates (e.g., `1 stroke`).

### Test 3 — Multi-Stroke Writing
1. Pinch and draw a horizontal stroke `-`.
2. Release the pinch and move your hand downward.
3. Pinch again and draw a vertical stroke `|` to form a `+` symbol.
4. Release the pinch.
5. **Expected Result**:
   - Two distinct, disconnected strokes are preserved without connecting artifacts.
   - Stroke count displays `2 strokes`.

### Test 4 — Hysteresis Stability (Anti-Flicker)
1. Pinch your thumb and index fingers together, then slightly loosen your grip without fully opening your hand (remaining within the $0.065 - 0.085$ distance range).
2. **Expected Result**:
   - The stroke does not break, stutter, or rapidly toggle on and off.
   - Only when your fingers clearly separate does the stroke end.

### Test 5 — Tracking Loss Safety
1. Start pinching and drawing a stroke.
2. While pinching, move your hand quickly out of the camera view.
3. **Expected Result**:
   - The active stroke terminates cleanly at the last detected position.
   - Status changes to **Hand Not Detected**.
4. Bring your hand back into view at a completely different corner of the screen and pinch again.
5. **Expected Result**:
   - A new independent stroke begins at the new position.
   - No wild diagonal line connects the previous stroke to the new stroke.

### Test 6 — Clear Writing Control
1. Draw multiple strokes across the screen.
2. Confirm the **"Clear Writing"** button shows the active count (e.g. `Clear Writing (3)`).
3. Click **"Clear Writing"**.
4. **Expected Result**:
   - All ink strokes are wiped clean immediately.
   - The stroke counter resets to 0.
   - The button becomes disabled until a new stroke is drawn.

### Test 7 — Camera Lifecycle & Stroke Persistence
1. Draw a math symbol (e.g. `x = 5`).
2. Click **"Stop Camera"**:
   - The webcam stream stops and the tracking overlay clears.
   - **Crucial**: The drawn equation `x = 5` remains visible on the canvas!
3. Click **"Start Camera"** again:
   - Camera resumes, hand tracking restarts, and your previously drawn equation remains preserved. You can continue adding strokes.

### Test 8 — Responsive Window Resizing
1. Draw strokes in the workspace.
2. Resize your browser window or toggle Developer Tools.
3. **Expected Result**:
   - The canvas automatically scales to the new viewport dimensions.
   - Stored normalized strokes redraw with perfect proportion and zero distortion.

---

## 7. Scope Boundaries (Milestone 3 vs. Later Milestones)

Per project roadmap specifications, Milestone 3 is strictly restricted to **Air-Writing Interaction**:
- **No Handwriting Recognition / OCR**: Conversion of strokes into text/LaTeX is reserved for Milestone 4.
- **No Mathematical Solving / Verification**: Step-by-step math evaluation belongs to Milestone 5.
- **No AI Tutoring**: LLM integration belongs to Milestone 6.
