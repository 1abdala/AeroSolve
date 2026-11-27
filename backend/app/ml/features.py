"""
AeroSolve — Milestone M5: Local Symbol Recognition
Canonical 76-Dimensional Feature Extraction Module (Python)

Shared feature schema:
  - Features 0–63 (64 dims): 8x8 Spatial Grid Density Zoning
  - Features 64–71 (8 dims):  8-Bin Directional Orientation Histogram
  - Feature 72    (1 dim):   Normalized Aspect Ratio (W / H clamped to 2.0 / 2.0)
  - Feature 73    (1 dim):   Normalized Stroke Count (min(K, 3) / 3.0)
  - Feature 74    (1 dim):   Normalized Total Arc-Length (clamp(L, 0, 3.0) / 3.0)
  - Feature 75    (1 dim):   Normalized First-to-Last Endpoint Distance (D_endpoints / (L + 1e-4))
"""

import math
from typing import Any, Dict, List, Optional, Tuple

FEATURE_VECTOR_SIZE = 76
GRID_SIZE = 8  # 8x8 spatial grid
NUM_DIRECTION_BINS = 8  # 8 octants


def extract_stroke_features(
    strokes: List[List[Dict[str, float]]],
    aspect_ratio: Optional[float] = None,
    stroke_count: Optional[int] = None,
) -> List[float]:
    """
    Extract a normalized 76-dimensional feature vector from processed strokes.
    Strokes must be in unit coordinate space [0, 1] x [0, 1].

    Args:
        strokes: List of strokes, where each stroke is a list of dicts with 'x' and 'y'.
        aspect_ratio: Optional pre-computed bounding box aspect ratio (width / height).
        stroke_count: Optional pre-computed stroke count.

    Returns:
        76-dimensional list of floats in [0, 1].
    """
    # Initialize full feature vector with zeros
    features = [0.0] * FEATURE_VECTOR_SIZE

    # Sanitize strokes: keep non-empty strokes with valid finite coordinates
    valid_strokes: List[List[Tuple[float, float]]] = []
    total_points = 0
    min_x, min_y = float("inf"), float("inf")
    max_x, max_y = float("-inf"), float("-inf")

    for stroke in strokes:
        if not stroke or not isinstance(stroke, list):
            continue
        valid_pts: List[Tuple[float, float]] = []
        for pt in stroke:
            if not isinstance(pt, dict):
                continue
            x = pt.get("x")
            y = pt.get("y")
            if x is not None and y is not None and math.isfinite(x) and math.isfinite(y):
                valid_pts.append((float(x), float(y)))
                if x < min_x:
                    min_x = x
                if x > max_x:
                    max_x = x
                if y < min_y:
                    min_y = y
                if y > max_y:
                    max_y = y
        if valid_pts:
            valid_strokes.append(valid_pts)
            total_points += len(valid_pts)

    if not valid_strokes or total_points == 0:
        return features

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
            # Single-point dot
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
                # Accumulate directional histogram (weighted by segment length)
                angle = math.atan2(dy, dx)  # in [-pi, pi]
                # Map angle [-pi, pi] into [0, 8)
                norm_angle = (angle + math.pi) / (2.0 * math.pi) * NUM_DIRECTION_BINS
                bin_idx = min(NUM_DIRECTION_BINS - 1, max(0, int(math.floor(norm_angle))))
                dir_bins[bin_idx] += seg_len
                total_dir_weight += seg_len

                # Discretize segment for grid cell density
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
            else:
                col = min(GRID_SIZE - 1, max(0, int(math.floor(x1 * GRID_SIZE))))
                row = min(GRID_SIZE - 1, max(0, int(math.floor(y1 * GRID_SIZE))))
                grid_cells[row * GRID_SIZE + col] += 1e-5
                total_grid_weight += 1e-5

    # Normalize grid density to sum to 1.0
    if total_grid_weight > 1e-6:
        for idx in range(len(grid_cells)):
            features[idx] = round(grid_cells[idx] / total_grid_weight, 6)

    # Normalize directional histogram to sum to 1.0
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
    # Clamp AR to [0, 2.0] and scale to [0, 1.0]
    features[72] = round(min(max(ar, 0.0), 2.0) / 2.0, 6)

    # 4. Normalized Stroke Count (Feature 73)
    k = stroke_count if stroke_count is not None else len(valid_strokes)
    features[73] = round(min(max(k, 1), 3) / 3.0, 6)

    # 5. Normalized Total Arc-Length (Feature 74)
    # Clamp to [0, 3.0] and scale to [0, 1.0]
    features[74] = round(min(max(total_arc_length, 0.0), 3.0) / 3.0, 6)

    # 6. Normalized First-to-Last Endpoint Distance (Feature 75)
    first_pt = valid_strokes[0][0]
    last_pt = valid_strokes[-1][-1]
    ep_dist = math.hypot(last_pt[0] - first_pt[0], last_pt[1] - first_pt[1])
    norm_ep = ep_dist / (total_arc_length + 1e-4)
    features[75] = round(min(max(norm_ep, 0.0), 1.0), 6)

    return features
