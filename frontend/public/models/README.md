# MediaPipe Hand Landmarker Model Asset

## Model Details
- **Model Name**: Hand Landmarker (float16)
- **File**: `hand_landmarker.task`
- **File Size**: ~7.82 MB (7,819,105 bytes)
- **Source**: Google MediaPipe Models Repository
  - Official Download URL: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`
- **Version**: 1 (Bundle specification v1)
- **Publisher**: Google LLC
- **License**: Apache License 2.0 (http://www.apache.org/licenses/LICENSE-2.0)

## Purpose & Architecture
The MediaPipe Hand Landmarker task detects 21 3D hand landmarks in real time. It consists of:
1. **Palm Detector**: Identifies bounding boxes around hands in image/video frames.
2. **Hand Landmark Model**: Predicts 21 3D landmarks (x, y, z) inside the detected hand region.

## Landmark Reference
- Index 0: `WRIST`
- Index 1: `THUMB_CMC`
- Index 2: `THUMB_MCP`
- Index 3: `THUMB_IP`
- Index 4: `THUMB_TIP`
- Index 5: `INDEX_FINGER_MCP`
- Index 6: `INDEX_FINGER_PIP`
- Index 7: `INDEX_FINGER_DIP`
- **Index 8: `INDEX_FINGER_TIP` (Primary tracking target for AeroSolve)**
- Index 9: `MIDDLE_FINGER_MCP`
- Index 10: `MIDDLE_FINGER_PIP`
- Index 11: `MIDDLE_FINGER_DIP`
- Index 12: `MIDDLE_FINGER_TIP`
- Index 13: `RING_FINGER_MCP`
- Index 14: `RING_FINGER_PIP`
- Index 15: `RING_FINGER_DIP`
- Index 16: `RING_FINGER_TIP`
- Index 17: `PINKY_MCP`
- Index 18: `PINKY_PIP`
- Index 19: `PINKY_DIP`
- Index 20: `PINKY_TIP`
