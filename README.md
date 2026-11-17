# AeroSolve — Milestone 2: Hand Tracking with MediaPipe

AeroSolve is an AI-powered air-writing mathematics learning application. This repository contains **Milestone 2 (M2): Hand Tracking**, building upon the Milestone 1 foundation by integrating Google MediaPipe Hand Landmarker for real-time 21-landmark hand detection and index fingertip tracking directly over the live webcam feed.

---

## 1. Technology Stack

- **Frontend**:
  - React 19
  - Vite 8
  - Google MediaPipe Tasks Vision (`@mediapipe/tasks-vision` v1.2.3)
  - HTML5 Video & Canvas Rendering Context 2D
  - Vitest (Frontend unit testing)
- **Backend**:
  - Python 3.10+ (tested on Python 3.15)
  - FastAPI 0.163
  - Uvicorn (ASGI server)
  - Pydantic v2
  - Pytest & HTTPX (Backend integration testing)

---

## 2. MediaPipe Hand Landmarker Integration

### Model Asset Specifications
- **Model Bundle**: `hand_landmarker.task` (float16)
- **Asset Size**: ~7.82 MB (7,819,105 bytes)
- **Local Path**: `frontend/public/models/hand_landmarker.task`
- **Official Source**: Google MediaPipe Models Repository
  `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`
- **Publisher**: Google LLC
- **License**: Apache License 2.0 (http://www.apache.org/licenses/LICENSE-2.0)
- **Runtime Mode**: `VIDEO` running mode with single-hand detection (`numHands: 1`)
- **Confidence Thresholds**:
  - `minHandDetectionConfidence: 0.5`
  - `minHandPresenceConfidence: 0.5`
  - `minTrackingConfidence: 0.5`
- **Delegates**: GPU acceleration (WebGL) with automatic fallback to CPU.

### Hand Landmark Topology
MediaPipe produces 21 3D landmarks for each detected hand. Landmark indices:
- `0`: Wrist
- `1 - 4`: Thumb (`THUMB_CMC`, `THUMB_MCP`, `THUMB_IP`, `THUMB_TIP`)
- `5 - 8`: Index Finger (`INDEX_FINGER_MCP`, `INDEX_FINGER_PIP`, `INDEX_FINGER_DIP`, **`INDEX_FINGER_TIP` - Landmark #8**)
- `9 - 12`: Middle Finger
- `13 - 16`: Ring Finger
- `17 - 20`: Pinky Finger

### Coordinate Transformation & Mirroring
To provide a natural selfie mirror experience, the `<video>` element is horizontally flipped using CSS `transform: scaleX(-1)`.
To prevent text labels and HUD elements from appearing mirrored or backwards, the overlay `<canvas>` is kept unmirrored. Normalized coordinates $(x_{\text{norm}}, y_{\text{norm}})$ from MediaPipe's raw sensor space are mapped to canvas pixels as follows:

$$\text{pixelX} = (1 - x_{\text{norm}}) \times \text{canvasWidth}$$
$$\text{pixelY} = y_{\text{norm}} \times \text{canvasHeight}$$

This ensures that:
1. Moving your hand to your right moves the tracking reticle to the right of the screen.
2. The reticle aligns directly over the mirrored finger.
3. HUD text and tooltip badges remain sharp and readable left-to-right.

---

## 3. Project Structure

```text
AeroSolve/
├── frontend/
│   ├── public/
│   │   ├── models/
│   │   │   ├── README.md               # Model asset documentation & license
│   │   │   └── hand_landmarker.task    # Google MediaPipe float16 model
│   │   ├── wasm/                       # Local MediaPipe vision WASM binaries
│   │   ├── favicon.svg
│   │   └── icons.svg
│   ├── src/
│   │   ├── components/
│   │   │   ├── BackendStatus.jsx       # Real-time backend status and retry
│   │   │   ├── CameraPreview.jsx       # Webcam stream & tracking overlay canvas
│   │   │   └── Header.jsx              # Branding & Milestone 2 badge
│   │   ├── hooks/
│   │   │   └── useHandTracking.js      # 60 FPS animation loop & canvas drawing
│   │   ├── services/
│   │   │   ├── api.js                  # API client for backend health
│   │   │   └── handTracking.js         # MediaPipe HandLandmarker singleton service
│   │   ├── tests/
│   │   │   ├── api.test.js             # API service unit tests
│   │   │   └── handTracking.test.js    # Landmark topology & coordinate mapping tests
│   │   ├── App.css                     # Responsive styling & tracking reticle styles
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
- Open [http://localhost:5173](http://localhost:5173) in Chrome, Edge, Firefox, or Safari.

---

## 5. Automated Verification

Run both test suites to verify system integrity:

```powershell
# Frontend automated tests (Vitest)
cd frontend
npm test

# Frontend linting (oxlint) & production build
npm run lint
npm run build

# Backend automated tests (pytest)
cd ../backend
.\.venv\Scripts\pytest.exe -v
```

---

## 6. Manual Testing Instructions (Milestone 2)

Follow these 7 manual verification tests to validate Milestone 2:

### Test 1 — Hand Detection
1. Open `http://localhost:5173`.
2. Confirm the backend shows **Connected** and model badge displays **Model Ready**.
3. Click **"Start Camera"** and allow browser camera permissions.
4. Place one hand in front of the camera.
5. **Expected Result**:
   - The status badge switches from **No Hand Detected** to **Hand Detected (Right)** or **Hand Detected (Left)** with confidence percentage.
   - The 21 landmarks and skeleton connections appear over your hand.

### Test 2 — Fingertip Tracking
1. Point your index finger forward.
2. Move your index finger left, right, up, and down.
3. **Expected Result**:
   - A bright cyan pulsing reticle directly follows the tip of your index finger (Landmark #8).
   - The tooltip label displays `INDEX FINGERTIP` with real-time normalized coordinates.
   - The telemetry bar updates the pixel and normalized $(x, y, z)$ coordinates smoothly.

### Test 3 — Different Positions & Distances
1. Move your hand closer to the camera lens.
2. Move your hand farther away.
3. Move your hand towards the corners and edges of the video viewport.
4. **Expected Result**:
   - The reticle remains locked to the physical index fingertip.
   - As your hand moves closer, the landmark points scale naturally with the hand.
   - At the edges of the frame, the tooltip does not clip off-screen.

### Test 4 — Hand Disappears
1. Move your hand completely out of the camera view.
2. **Expected Result**:
   - The fingertip reticle and skeleton overlay disappear immediately from the canvas.
   - Status badge switches to **No Hand Detected**.
   - Telemetry coordinates display dashes (`—`).

### Test 5 — Hand Returns
1. Bring your hand back into the camera view.
2. **Expected Result**:
   - Tracking immediately resumes without any lag or page reload.
   - Status returns to **Hand Detected**.

### Test 6 — Camera Lifecycle & Skeleton Toggle
1. Click **"Hide Skeleton"**:
   - The 20 skeleton lines and blue joint dots disappear, leaving only the focused index fingertip reticle.
2. Click **"Show Skeleton"**:
   - The 21 landmarks and connections reappear.
3. Click **"Stop Camera"**:
   - All camera hardware tracks stop immediately and the webcam indicator light turns off.
   - Overlay canvas clears and state resets to **Camera Inactive**.
4. Click **"Start Camera"** again:
   - Camera restarts, model remains cached in memory, and tracking resumes seamlessly.

### Test 7 — Multiple Hands Handling
1. Show both hands in front of the camera simultaneously.
2. **Expected Result**:
   - AeroSolve tracks exactly one primary hand consistently according to its configured single-hand detection constraint (`numHands: 1`), without jittering or spawning conflicting reticles.

---

## 7. Scope Boundaries (Milestone 2 vs. Milestone 3)

This milestone implements **Hand & Fingertip Tracking only**. Per the project roadmap, the following features are strictly reserved for Milestone 3 and subsequent milestones:
- No pinch-to-write or drawing gestures.
- No virtual canvas ink or drawing strokes.
- No handwriting recognition or mathematical verification.
- No AI tutoring or statistics engines.
