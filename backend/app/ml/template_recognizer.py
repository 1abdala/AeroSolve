"""
AeroSolve — Milestone M5: Local Symbol Recognition
Candidate A: Multi-Stroke Point-Cloud Template Recognizer (P+ adapted)
"""

import math
import time
from typing import Any, Dict, List, Optional, Tuple

NUM_POINTS_RESAMPLED = 32


def resample_point_cloud(
    strokes: List[List[Dict[str, float]]],
    target_points: int = NUM_POINTS_RESAMPLED,
) -> List[Dict[str, Any]]:
    """
    Resample multi-stroke point cloud to a fixed number of uniformly spaced points,
    preserving stroke IDs and normalized coordinates in [0, 1] x [0, 1].
    """
    # Filter valid points
    clean_strokes: List[List[Tuple[float, float]]] = []
    for s_idx, stroke in enumerate(strokes):
        if not stroke or not isinstance(stroke, list):
            continue
        pts: List[Tuple[float, float]] = []
        for pt in stroke:
            if isinstance(pt, dict):
                x = pt.get("x")
                y = pt.get("y")
                if x is not None and y is not None and math.isfinite(x) and math.isfinite(y):
                    pts.append((float(x), float(y)))
        if pts:
            clean_strokes.append(pts)

    if not clean_strokes:
        return []

    # Calculate total arc length across all strokes
    stroke_lengths = []
    total_len = 0.0
    for stroke in clean_strokes:
        slen = 0.0
        for i in range(len(stroke) - 1):
            slen += math.hypot(stroke[i + 1][0] - stroke[i][0], stroke[i + 1][1] - stroke[i][1])
        stroke_lengths.append(slen)
        total_len += slen

    # If completely stationary or degenerate
    if total_len < 1e-6:
        first_pt = clean_strokes[0][0]
        return [{"x": first_pt[0], "y": first_pt[1], "stroke": 0} for _ in range(target_points)]

    # Distribute target points proportionally across strokes
    resampled_cloud: List[Dict[str, Any]] = []
    assigned_points_total = 0

    for s_idx, (stroke, slen) in enumerate(zip(clean_strokes, stroke_lengths)):
        if s_idx == len(clean_strokes) - 1:
            pts_for_stroke = target_points - assigned_points_total
        else:
            fraction = slen / total_len
            pts_for_stroke = max(2, int(round(fraction * target_points)))
            # Guarantee at least 2 points left for remaining strokes
            rem_strokes = len(clean_strokes) - 1 - s_idx
            pts_for_stroke = min(pts_for_stroke, (target_points - assigned_points_total) - rem_strokes * 2)

        pts_for_stroke = max(2, pts_for_stroke)
        assigned_points_total += pts_for_stroke

        if slen < 1e-7 or len(stroke) == 1:
            pt = stroke[0]
            for _ in range(pts_for_stroke):
                resampled_cloud.append({"x": pt[0], "y": pt[1], "stroke": s_idx})
            continue

        step = slen / (pts_for_stroke - 1)
        resampled_cloud.append({"x": stroke[0][0], "y": stroke[0][1], "stroke": s_idx})

        acc_dist = 0.0
        target_dist = step
        seg_idx = 0

        while seg_idx < len(stroke) - 1 and len(resampled_cloud) < assigned_points_total:
            p1 = stroke[seg_idx]
            p2 = stroke[seg_idx + 1]
            seg_len = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
            if seg_len < 1e-7:
                seg_idx += 1
                continue

            if acc_dist + seg_len >= target_dist:
                t = (target_dist - acc_dist) / seg_len
                resampled_cloud.append({
                    "x": p1[0] + t * (p2[0] - p1[0]),
                    "y": p1[1] + t * (p2[1] - p1[1]),
                    "stroke": s_idx,
                })
                target_dist += step
            else:
                acc_dist += seg_len
                seg_idx += 1

        while len(resampled_cloud) < assigned_points_total:
            last_p = stroke[-1]
            resampled_cloud.append({"x": last_p[0], "y": last_p[1], "stroke": s_idx})

    return resampled_cloud[:target_points]


def cloud_distance(
    cloud1: List[Dict[str, Any]],
    cloud2: List[Dict[str, Any]],
) -> float:
    """
    Computes bidirectional point-cloud distance between two normalized stroke clouds.
    D(C1, C2) = 0.5 * (mean_{p in C1} min_{q in C2} ||p - q|| + mean_{q in C2} min_{p in C1} ||q - p||)
    """
    n1 = len(cloud1)
    n2 = len(cloud2)
    if n1 == 0 or n2 == 0:
        return float("inf")

    # Sum of min distances from cloud1 to cloud2
    d1_to_2 = 0.0
    for p in cloud1:
        min_d2 = float("inf")
        px, py = p["x"], p["y"]
        for q in cloud2:
            dx = px - q["x"]
            dy = py - q["y"]
            d2 = dx * dx + dy * dy
            if d2 < min_d2:
                min_d2 = d2
                if d2 < 1e-6:
                    break
        d1_to_2 += math.sqrt(min_d2)

    # Sum of min distances from cloud2 to cloud1
    d2_to_1 = 0.0
    for q in cloud2:
        min_d2 = float("inf")
        qx, qy = q["x"], q["y"]
        for p in cloud1:
            dx = qx - p["x"]
            dy = qy - p["y"]
            d2 = dx * dx + dy * dy
            if d2 < min_d2:
                min_d2 = d2
                if d2 < 1e-6:
                    break
        d2_to_1 += math.sqrt(min_d2)

    return 0.5 * ((d1_to_2 / n1) + (d2_to_1 / n2))


class PointCloudTemplateRecognizer:
    """
    Multi-stroke point cloud template recognizer for digits 0–9.
    """

    def __init__(self, templates: Optional[List[Dict[str, Any]]] = None):
        self.templates: List[Dict[str, Any]] = templates or []
        self.classes = [str(i) for i in range(10)]

    def add_template(
        self,
        label: str,
        name: str,
        strokes: List[List[Dict[str, float]]],
    ) -> None:
        points = resample_point_cloud(strokes, NUM_POINTS_RESAMPLED)
        stroke_count = len(strokes)
        self.templates.append({
            "label": label,
            "name": name,
            "points": points,
            "stroke_count": stroke_count,
        })

    def predict(
        self,
        strokes: List[List[Dict[str, float]]],
        aspect_ratio: Optional[float] = None,
        stroke_count: Optional[int] = None,
    ) -> Dict[str, Any]:
        t0 = time.perf_counter()

        cloud = resample_point_cloud(strokes, NUM_POINTS_RESAMPLED)
        if not cloud or not self.templates:
            return {
                "top_prediction": "0",
                "confidence": 0.0,
                "candidates": [{"label": str(i), "score": 0.0} for i in range(3)],
                "all_scores": {c: 0.0 for c in self.classes},
                "latency_ms": round((time.perf_counter() - t0) * 1000, 3),
            }

        k_strokes = stroke_count if stroke_count is not None else len(strokes)

        # Compute distance to each template
        class_best_dist: Dict[str, float] = {c: float("inf") for c in self.classes}

        for tmpl in self.templates:
            lbl = tmpl["label"]
            raw_dist = cloud_distance(cloud, tmpl["points"])
            # Slight penalty if stroke count differs significantly
            stroke_penalty = 0.06 * abs(k_strokes - tmpl.get("stroke_count", 1))
            dist = raw_dist + stroke_penalty
            if dist < class_best_dist[lbl]:
                class_best_dist[lbl] = dist

        # Convert distances to similarity scores in [0, 1]
        # max acceptable distance ~ 0.35
        d_max = 0.35
        all_scores: Dict[str, float] = {}
        for c in self.classes:
            d = class_best_dist[c]
            sim = max(0.0, 1.0 - (d / d_max))
            all_scores[c] = round(sim, 4)

        # Sort candidates by similarity score descending
        sorted_candidates = sorted(all_scores.items(), key=lambda item: item[1], reverse=True)
        top_prediction = sorted_candidates[0][0]
        confidence = sorted_candidates[0][1]

        candidates = [
            {"label": lbl, "score": score}
            for lbl, score in sorted_candidates[:3]
        ]

        latency_ms = round((time.perf_counter() - t0) * 1000, 3)

        return {
            "top_prediction": top_prediction,
            "confidence": confidence,
            "candidates": candidates,
            "all_scores": all_scores,
            "latency_ms": latency_ms,
        }

    def export_to_json(self) -> Dict[str, Any]:
        return {
            "model_type": "point_cloud_template",
            "version": "1.0.0",
            "num_points": NUM_POINTS_RESAMPLED,
            "classes": self.classes,
            "templates": self.templates,
        }

    @classmethod
    def from_json(cls, data: Dict[str, Any]) -> "PointCloudTemplateRecognizer":
        rec = cls()
        rec.templates = data.get("templates", [])
        rec.classes = data.get("classes", [str(i) for i in range(10)])
        return rec
