"""
AeroSolve — Milestone M5: Local Symbol Recognition
Synthetic Handwritten Digit Corpus Generator (Digits 0–9) — Phase 3 Improved

Generates realistic vector air-writing strokes for digits 0–9 matching the exact
M4 stroke processing format:
  - 32 equidistant points per stroke (uniform spatial arc-length)
  - Chaikin smoothing (iterations=2, preserveEndpoints=True)
  - Aspect-ratio preserving normalization into [0.05, 0.95]^2
  - Realistic natural handwriting imperfections:
      * Natural incomplete loop closures (open gaps of 5%–20%) on digit 0 and 8
      * Straight, narrow, varied vertical digit 1s (AR 0.02–0.08) without artificial printed serifs
      * Realistic figure-8 S-curves and 2-stroke stacked loops for digit 8
      * Multi-stroke variants for digits 4, 5, 7, 8
      * Low-frequency hand drift and smooth human tremor (avoiding high-frequency white noise)

Outputs:
  - backend/data/synthetic_train.json (3,000 samples: 300 per digit)
  - backend/data/synthetic_val.json (1,000 samples: 100 per digit)
"""

import json
import math
import os
import random
from typing import Any, Dict, List, Tuple


def compute_arc_length(stroke: List[Tuple[float, float]]) -> float:
    """Calculates total arc-length of a 2D polyline."""
    if len(stroke) <= 1:
        return 0.0
    return sum(
        math.hypot(stroke[i][0] - stroke[i - 1][0], stroke[i][1] - stroke[i - 1][1])
        for i in range(1, len(stroke))
    )


def m4_chaikin_smooth(
    stroke: List[Tuple[float, float]],
    iterations: int = 2,
) -> List[Tuple[float, float]]:
    """Applies M4 Chaikin smoothing with preserved endpoints."""
    if len(stroke) <= 2:
        return list(stroke)

    curr = list(stroke)
    for _ in range(iterations):
        nxt = [curr[0]]
        for i in range(1, len(curr) - 1):
            prev = curr[i - 1]
            c = curr[i]
            fwd = curr[i + 1]
            nx = 0.25 * prev[0] + 0.5 * c[0] + 0.25 * fwd[0]
            ny = 0.25 * prev[1] + 0.5 * c[1] + 0.25 * fwd[1]
            nxt.append((nx, ny))
        nxt.append(curr[-1])
        curr = nxt
    return curr


def m4_resample_stroke(
    stroke: List[Tuple[float, float]],
    target_points: int = 32,
) -> List[Tuple[float, float]]:
    """Resamples stroke into exactly target_points equidistant arc-length points."""
    if len(stroke) <= 1:
        return [stroke[0]] * target_points if stroke else []

    total_len = compute_arc_length(stroke)
    if total_len < 1e-6:
        return [stroke[0]] * target_points

    num_segments = max(1, target_points - 1)
    interval = total_len / num_segments

    resampled = [stroke[0]]
    accumulated_dist = 0.0
    target_dist = interval
    curr_seg_idx = 0

    while curr_seg_idx < len(stroke) - 1 and len(resampled) < target_points:
        p1 = stroke[curr_seg_idx]
        p2 = stroke[curr_seg_idx + 1]
        seg_len = math.hypot(p2[0] - p1[0], p2[1] - p1[1])

        if seg_len < 1e-7:
            curr_seg_idx += 1
            continue

        if accumulated_dist + seg_len >= target_dist:
            dist_into = target_dist - accumulated_dist
            t = dist_into / seg_len
            ix = p1[0] + t * (p2[0] - p1[0])
            iy = p1[1] + t * (p2[1] - p1[1])
            resampled.append((ix, iy))
            target_dist += interval
        else:
            accumulated_dist += seg_len
            curr_seg_idx += 1

    # Ensure last point matches end of stroke
    if len(resampled) < target_points:
        resampled.append(stroke[-1])
    else:
        resampled[-1] = stroke[-1]

    return resampled


def m4_normalize_strokes(
    strokes: List[List[Tuple[float, float]]],
    padding: float = 0.05,
) -> Tuple[List[List[Dict[str, float]]], float]:
    """Isotropic unit-box normalization matching M4 strokeProcessor.js."""
    if not strokes or not any(strokes):
        return [], 1.0

    min_x = min(pt[0] for s in strokes for pt in s)
    max_x = max(pt[0] for s in strokes for pt in s)
    min_y = min(pt[1] for s in strokes for pt in s)
    max_y = max(pt[1] for s in strokes for pt in s)

    w = max(0.0, max_x - min_x)
    h = max(0.0, max_y - min_y)
    ar = round(w / h, 3) if h > 1e-5 else 1.0

    usable = max(0.1, 1.0 - 2 * padding)
    max_dim = max(w, h, 1e-6)
    scale = usable / max_dim

    offset_x = (1.0 - w * scale) / 2.0
    offset_y = (1.0 - h * scale) / 2.0

    result = []
    for s in strokes:
        stroke_pts = []
        for x, y in s:
            nx = round((x - min_x) * scale + offset_x, 5)
            ny = round((y - min_y) * scale + offset_y, 5)
            stroke_pts.append({"x": nx, "y": ny})
        result.append(stroke_pts)

    return result, ar


def sample_bezier(
    p0: Tuple[float, float],
    p1: Tuple[float, float],
    p2: Tuple[float, float],
    p3: Tuple[float, float],
    steps: int = 16,
) -> List[Tuple[float, float]]:
    """Sample points along a cubic Bezier curve."""
    pts = []
    for i in range(steps + 1):
        t = i / steps
        u = 1.0 - t
        x = u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0]
        y = u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


def apply_smooth_tremor(
    points: List[Tuple[float, float]],
    amplitude: float = 0.008,
    rng: random.Random = None,
) -> List[Tuple[float, float]]:
    """Applies low-frequency smooth human motor drift instead of jagged point noise."""
    if rng is None:
        rng = random
    n = len(points)
    if n <= 2:
        return points

    # Random low-frequency sinusoidal drift
    freq1 = rng.uniform(1.0, 2.5)
    freq2 = rng.uniform(2.0, 4.0)
    phase_x = rng.uniform(0, 2 * math.pi)
    phase_y = rng.uniform(0, 2 * math.pi)

    res = []
    for i, (x, y) in enumerate(points):
        frac = i / max(1, n - 1)
        drift_x = amplitude * (math.sin(frac * freq1 * math.pi + phase_x) + 0.3 * math.sin(frac * freq2 * math.pi))
        drift_y = amplitude * (math.cos(frac * freq1 * math.pi + phase_y) + 0.3 * math.cos(frac * freq2 * math.pi))
        # Keep endpoints stable
        weight = math.sin(frac * math.pi)
        res.append((x + drift_x * weight, y + drift_y * weight))
    return res


def rotate_scale_points(
    strokes: List[List[Tuple[float, float]]],
    angle_rad: float,
    scale_x: float,
    scale_y: float,
) -> List[List[Tuple[float, float]]]:
    """Applies rotation and independent axis scaling around stroke centroid."""
    all_pts = [p for s in strokes for p in s]
    if not all_pts:
        return strokes
    cx = sum(p[0] for p in all_pts) / len(all_pts)
    cy = sum(p[1] for p in all_pts) / len(all_pts)

    cos_a = math.cos(angle_rad)
    sin_a = math.sin(angle_rad)

    res = []
    for s in strokes:
        ns = []
        for x, y in s:
            dx = (x - cx) * scale_x
            dy = (y - cy) * scale_y
            rx = cx + dx * cos_a - dy * sin_a
            ry = cy + dx * sin_a + dy * cos_a
            ns.append((rx, ry))
        res.append(ns)
    return res


def generate_digit_strokes(digit: int, rng: random.Random) -> Tuple[List[List[Dict[str, float]]], float]:
    """Procedurally generates realistic air-writing strokes for a given digit (0–9)."""
    raw_strokes: List[List[Tuple[float, float]]] = []

    if digit == 0:
        # DIGIT 0: Varied loop closure, eccentricity, and pinch-release gaps
        cx, cy = 0.5, 0.5
        rx = rng.uniform(0.25, 0.40)
        ry = rng.uniform(0.36, 0.46)
        start_angle = rng.uniform(-math.pi / 2 - 0.25, -math.pi / 2 + 0.25)
        direction = -1 if rng.random() > 0.15 else 1  # 85% counter-clockwise

        style_choice = rng.random()
        if style_choice < 0.45:
            # Style 0A: Natural pinch-release gap at top (5% to 20% open)
            gap_rad = rng.uniform(0.25, 0.90)  # Gap angle
            sweep = 2 * math.pi - gap_rad
        elif style_choice < 0.75:
            # Style 0B: Complete closed loop
            sweep = 2 * math.pi
        else:
            # Style 0C: Slight spiral / overshoot (5% to 15% overlap)
            overshoot_rad = rng.uniform(0.20, 0.65)
            sweep = 2 * math.pi + overshoot_rad

        steps = rng.randint(28, 40)
        oval = []
        for i in range(steps + 1):
            theta = start_angle + direction * (sweep * (i / steps))
            # Subtle human asymmetry: slightly wider at base
            asym_x = 1.0 + 0.08 * math.sin(theta)
            asym_y = 1.0 + 0.05 * math.cos(theta)
            oval.append((cx + rx * asym_x * math.cos(theta), cy + ry * asym_y * math.sin(theta)))
        raw_strokes.append(oval)

    elif digit == 1:
        # DIGIT 1: Overwhelmingly straight vertical gestures (AR 0.02 - 0.15)
        style_choice = rng.random()
        if style_choice < 0.75:
            # Style 1A: Simple straight vertical stroke (75%)
            tilt = rng.uniform(-0.04, 0.04)  # Subtle tilt (+/- 2.5 degrees)
            bow = rng.uniform(-0.015, 0.015)  # Subtle human arm curvature
            y_start = rng.uniform(0.08, 0.14)
            y_end = rng.uniform(0.86, 0.94)
            x_mid = 0.5 + bow
            stem = sample_bezier(
                (0.50 + tilt, y_start),
                (x_mid, y_start + (y_end - y_start) * 0.35),
                (x_mid, y_start + (y_end - y_start) * 0.70),
                (0.50 - tilt, y_end),
                steps=24,
            )
            raw_strokes.append(stem)
        elif style_choice < 0.90:
            # Style 1B: Straight vertical line with small top hook/tick (15%)
            hook_w = rng.uniform(0.04, 0.08)
            hook_h = rng.uniform(0.05, 0.10)
            hook = sample_bezier((0.50 - hook_w, 0.10 + hook_h), (0.48, 0.10), (0.49, 0.10), (0.50, 0.10), steps=6)
            stem = sample_bezier((0.50, 0.10), (0.50, 0.40), (0.50, 0.70), (0.50, 0.90), steps=18)
            raw_strokes.append(hook + stem[1:])
        else:
            # Style 1C: European style with diagonal entry stroke (10%)
            up_diag = sample_bezier((0.38, 0.28), (0.42, 0.20), (0.47, 0.12), (0.50, 0.10), steps=8)
            down_stem = sample_bezier((0.50, 0.10), (0.50, 0.40), (0.50, 0.70), (0.50, 0.90), steps=18)
            raw_strokes.append(up_diag + down_stem[1:])

    elif digit == 2:
        # DIGIT 2: Curved top arch -> diagonal down-left -> horizontal base line to right
        arch_w = rng.uniform(0.40, 0.52)
        top_arch = sample_bezier((0.5 - arch_w / 2, 0.25), (0.35, 0.08), (0.65, 0.08), (0.5 + arch_w / 2, 0.25), steps=10)
        cusp_x = rng.uniform(0.20, 0.28)
        diagonal = sample_bezier((0.5 + arch_w / 2, 0.25), (0.62, 0.48), (0.38, 0.72), (cusp_x, 0.88), steps=12)
        base_end_x = rng.uniform(0.70, 0.82)
        # Small loop at cusp or sharp corner
        if rng.random() > 0.65:
            base = sample_bezier((cusp_x, 0.88), (cusp_x + 0.10, 0.84), (base_end_x - 0.10, 0.88), (base_end_x, 0.88), steps=8)
        else:
            base = sample_bezier((cusp_x, 0.88), (cusp_x + 0.15, 0.88), (base_end_x - 0.10, 0.88), (base_end_x, 0.88), steps=8)
        raw_strokes.append(top_arch + diagonal[1:] + base[1:])

    elif digit == 3:
        # DIGIT 3: Two rounded lobes with center cusp
        mid_y = rng.uniform(0.46, 0.52)
        cusp_x = rng.uniform(0.42, 0.50)
        lobe_w = rng.uniform(0.24, 0.32)
        top_loop = sample_bezier((0.28, 0.20), (0.45, 0.08), (0.5 + lobe_w, 0.18), (cusp_x, mid_y), steps=12)
        bot_loop = sample_bezier((cusp_x, mid_y), (0.5 + lobe_w * 1.1, mid_y + 0.18), (0.65, 0.92), (0.26, 0.85), steps=14)
        raw_strokes.append(top_loop + bot_loop[1:])

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

    elif digit == 6:
        # DIGIT 6: Diagonal downward arc into closed/near-closed bottom loop
        loop_closure = rng.uniform(0.92, 1.05)  # Can have small gap or overlap
        s = sample_bezier((0.65, 0.12), (0.38, 0.30), (0.22, 0.62), (0.35, 0.85), steps=14)
        loop = sample_bezier((0.35, 0.85), (0.76, 0.90), (0.76, 0.50), (0.30 * loop_closure, 0.55), steps=16)
        raw_strokes.append(s + loop[1:])

    elif digit == 7:
        # DIGIT 7: 1-stroke standard (65%) or 2-stroke with crossbar (35%)
        top_bar = sample_bezier((0.26, 0.15), (0.46, 0.15), (0.66, 0.15), (0.76, 0.15), steps=8)
        diag = sample_bezier((0.76, 0.15), (0.60, 0.45), (0.46, 0.72), (0.36, 0.90), steps=14)
        if rng.random() > 0.35:
            raw_strokes.append(top_bar + diag[1:])
        else:
            cross = sample_bezier((0.36, 0.52), (0.50, 0.52), (0.60, 0.52), (0.68, 0.52), steps=6)
            raw_strokes.append(top_bar + diag[1:])
            raw_strokes.append(cross)

    elif digit == 8:
        # DIGIT 8: Realistic Figure-8 with diverse human handwriting styles:
        #   - Style 8A (35%): Western continuous figure-8 (start top, CCW top loop, diagonal crossing down-right)
        #   - Style 8B (25%): Reverse continuous figure-8 (start top, CW top loop, diagonal crossing down-left)
        #   - Style 8C (15%): Center-crossing start (start at waist, loop up/down through center)
        #   - Style 8D (15%): 2-stroke snowman (stacked top and bottom loops, independent dirs/starts)
        #   - Style 8E (10%): Natural cubic Bezier S-spline (smooth human arm/wrist kinematics)
        style_choice = rng.random()

        if style_choice < 0.35:
            # Style 8A: Western continuous figure-8 (start top, CCW top loop)
            w_top = rng.uniform(0.10, 0.14)
            w_bot = rng.uniform(0.12, 0.16)
            h_top = rng.uniform(0.20, 0.26)
            h_bot = rng.uniform(0.22, 0.28)
            cy = rng.uniform(0.48, 0.52)
            start_offset_x = rng.uniform(-0.02, 0.02)

            gap_type = rng.random()
            sweep = 2 * math.pi
            if gap_type < 0.35:
                sweep -= rng.uniform(0.12, 0.50)  # Natural top gap
            elif gap_type > 0.80:
                sweep += rng.uniform(0.15, 0.45)  # Slight overshoot

            steps = rng.randint(32, 44)
            pts = []
            for i in range(steps + 1):
                t = (i / steps) * sweep
                w = w_top if math.cos(t) >= 0 else w_bot
                h = h_top if math.cos(t) >= 0 else h_bot
                waist_skew = rng.uniform(-0.015, 0.015) * math.sin(t)
                x = 0.5 + start_offset_x - w * math.sin(2 * t) + waist_skew
                y = cy - h * math.cos(t)
                pts.append((x, y))
            raw_strokes.append(pts)

        elif style_choice < 0.60:
            # Style 8B: Reverse continuous figure-8 (start top, CW top loop)
            w_top = rng.uniform(0.10, 0.14)
            w_bot = rng.uniform(0.12, 0.16)
            h_top = rng.uniform(0.20, 0.26)
            h_bot = rng.uniform(0.22, 0.28)
            cy = rng.uniform(0.48, 0.52)
            start_offset_x = rng.uniform(-0.02, 0.02)

            gap_type = rng.random()
            sweep = 2 * math.pi
            if gap_type < 0.35:
                sweep -= rng.uniform(0.12, 0.50)  # Natural top gap
            elif gap_type > 0.80:
                sweep += rng.uniform(0.15, 0.45)  # Slight overshoot

            steps = rng.randint(32, 44)
            pts = []
            for i in range(steps + 1):
                t = (i / steps) * sweep
                w = w_top if math.cos(t) >= 0 else w_bot
                h = h_top if math.cos(t) >= 0 else h_bot
                waist_skew = rng.uniform(-0.015, 0.015) * math.sin(t)
                x = 0.5 + start_offset_x + w * math.sin(2 * t) + waist_skew
                y = cy - h * math.cos(t)
                pts.append((x, y))
            raw_strokes.append(pts)

        elif style_choice < 0.75:
            # Style 8C: Center-crossing start (start at waist)
            w_top = rng.uniform(0.10, 0.14)
            w_bot = rng.uniform(0.12, 0.16)
            h_top = rng.uniform(0.20, 0.26)
            h_bot = rng.uniform(0.22, 0.28)
            cy = rng.uniform(0.48, 0.52)
            direction = 1 if rng.random() > 0.5 else -1
            phase = math.pi / 2 if rng.random() > 0.5 else -math.pi / 2

            steps = rng.randint(30, 42)
            pts = []
            for i in range(steps + 1):
                t = phase + direction * (i / steps) * 2 * math.pi
                w = w_top if math.cos(t) >= 0 else w_bot
                h = h_top if math.cos(t) >= 0 else h_bot
                x = 0.5 - w * math.sin(2 * t)
                y = cy - h * math.cos(t)
                pts.append((x, y))
            raw_strokes.append(pts)

        elif style_choice < 0.90:
            # Style 8D: 2-Stroke stacked loops (snowman style)
            r_top_x = rng.uniform(0.10, 0.14)
            r_top_y = rng.uniform(0.16, 0.21)
            r_bot_x = rng.uniform(0.12, 0.16)
            r_bot_y = rng.uniform(0.18, 0.24)

            cy1 = rng.uniform(0.30, 0.35)
            cy2 = rng.uniform(0.66, 0.72)
            cx1 = rng.uniform(0.48, 0.52)
            cx2 = rng.uniform(0.48, 0.52)

            start1 = rng.uniform(0, 2 * math.pi)
            dir1 = 1 if rng.random() > 0.35 else -1
            start2 = rng.uniform(0, 2 * math.pi)
            dir2 = 1 if rng.random() > 0.35 else -1

            loop1 = [
                (
                    cx1 + r_top_x * math.cos(start1 + dir1 * (i / 20 * 2 * math.pi)),
                    cy1 + r_top_y * math.sin(start1 + dir1 * (i / 20 * 2 * math.pi)),
                )
                for i in range(21)
            ]
            loop2 = [
                (
                    cx2 + r_bot_x * math.cos(start2 + dir2 * (i / 22 * 2 * math.pi)),
                    cy2 + r_bot_y * math.sin(start2 + dir2 * (i / 22 * 2 * math.pi)),
                )
                for i in range(23)
            ]
            raw_strokes.append(loop1)
            raw_strokes.append(loop2)

        else:
            # Style 8E: Cubic Bezier S-curve (natural arm/wrist kinematics)
            cx = rng.uniform(0.48, 0.52)
            cy = rng.uniform(0.48, 0.52)
            wt = rng.uniform(0.10, 0.14)
            wb = rng.uniform(0.12, 0.16)
            ht = rng.uniform(0.18, 0.24)
            hb = rng.uniform(0.20, 0.26)

            a1 = sample_bezier((cx, cy - ht), (cx - wt * 1.3, cy - ht * 0.9), (cx - wt * 0.8, cy - ht * 0.2), (cx, cy), steps=9)
            a2 = sample_bezier((cx, cy), (cx + wb * 0.8, cy + hb * 0.2), (cx + wb * 1.3, cy + hb * 0.9), (cx, cy + hb), steps=9)
            a3 = sample_bezier((cx, cy + hb), (cx - wb * 1.3, cy + hb * 0.9), (cx - wb * 0.8, cy + hb * 0.2), (cx, cy), steps=9)
            a4 = sample_bezier((cx, cy), (cx + wt * 0.8, cy - ht * 0.2), (cx + wt * 1.3, cy - ht * 0.9), (cx, cy - ht), steps=9)

            raw_strokes.append(a1 + a2[1:] + a3[1:] + a4[1:])

    elif digit == 9:
        # DIGIT 9: Top loop + downward stem on right
        cx, cy = 0.50, 0.32
        r = rng.uniform(0.18, 0.24)
        loop_steps = 18
        loop = [(cx + r * math.cos(t), cy + r * math.sin(t)) for t in [math.pi / 2 - (i / loop_steps) * 2 * math.pi for i in range(loop_steps + 1)]]
        stem = sample_bezier((cx + r, cy), (cx + r + 0.02, 0.60), (0.58, 0.82), (0.42, 0.90), steps=14)
        raw_strokes.append(loop + stem[1:])

    # 1. Apply natural smooth motor drift / human tremor
    with_tremor = [
        apply_smooth_tremor(s, amplitude=rng.uniform(0.003, 0.010), rng=rng)
        for s in raw_strokes
    ]

    # 2. Affine rotation & scaling perturbation
    angle = rng.uniform(-0.16, 0.16)  # +/- ~9 degrees
    scale_x = rng.uniform(0.88, 1.12)
    scale_y = rng.uniform(0.88, 1.12)
    transformed = rotate_scale_points(with_tremor, angle, scale_x, scale_y)

    # 3. Apply exact M4 processing stages:
    #    Chaikin smoothing -> 32-point uniform arc-length resampling -> isotropic normalization
    smoothed = [m4_chaikin_smooth(s, iterations=2) for s in transformed]
    resampled = [m4_resample_stroke(s, target_points=32) for s in smoothed]
    normalized, ar = m4_normalize_strokes(resampled, padding=0.05)

    return normalized, ar


def generate_dataset(
    num_samples_per_digit: int,
    seed: int = 42,
    id_prefix: str = "syn",
) -> List[Dict[str, Any]]:
    """Generates balanced synthetic dataset across digits 0–9."""
    rng = random.Random(seed)
    dataset = []

    for digit in range(10):
        for idx in range(num_samples_per_digit):
            strokes, ar = generate_digit_strokes(digit, rng)
            dataset.append({
                "id": f"{id_prefix}_{digit}_{idx:04d}",
                "label": str(digit),
                "digit": digit,
                "strokes": strokes,
                "stroke_count": len(strokes),
                "aspect_ratio": ar,
                "point_count": sum(len(s) for s in strokes),
                "is_synthetic": True,
                "capture_source": "m4_equivalent_generator",
            })

    rng.shuffle(dataset)
    return dataset


def main():
    os.makedirs("backend/data", exist_ok=True)

    print("Generating improved synthetic training set (3,000 samples, 300 per digit)...")
    train_data = generate_dataset(300, seed=1001, id_prefix="syn_train")
    with open("backend/data/synthetic_train.json", "w") as f:
        json.dump(train_data, f, indent=2)
    print(f"Saved {len(train_data)} training samples to backend/data/synthetic_train.json")

    print("Generating improved synthetic validation set (1,000 samples, 100 per digit)...")
    val_data = generate_dataset(100, seed=2002, id_prefix="syn_val")
    with open("backend/data/synthetic_val.json", "w") as f:
        json.dump(val_data, f, indent=2)
    print(f"Saved {len(val_data)} validation samples to backend/data/synthetic_val.json")


if __name__ == "__main__":
    main()
