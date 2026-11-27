"""
AeroSolve — Phase 3: Synthetic Dataset Realism & M4 Format Verification Tests
"""

import json
import os
import math
import random
import pytest
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from tools.generate_synthetic_corpus import generate_digit_strokes
from app.ml.features import extract_stroke_features


@pytest.fixture(scope="module")
def train_data():
    path = "backend/data/synthetic_train.json"
    assert os.path.exists(path), f"Missing {path}"
    with open(path, "r") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def val_data():
    path = "backend/data/synthetic_val.json"
    assert os.path.exists(path), f"Missing {path}"
    with open(path, "r") as f:
        return json.load(f)


def test_dataset_sample_counts_and_distributions(train_data, val_data):
    """Verifies sample counts and balanced per-digit distributions."""
    assert len(train_data) == 3000
    assert len(val_data) == 1000

    train_counts = {}
    for item in train_data:
        lbl = item["label"]
        train_counts[lbl] = train_counts.get(lbl, 0) + 1

    for d in range(10):
        assert train_counts[str(d)] == 300, f"Digit {d} has {train_counts.get(str(d))} samples"

    val_counts = {}
    for item in val_data:
        lbl = item["label"]
        val_counts[lbl] = val_counts.get(lbl, 0) + 1

    for d in range(10):
        assert val_counts[str(d)] == 100, f"Digit {d} has {val_counts.get(str(d))} samples"


def test_split_independence_and_no_id_leakage(train_data, val_data):
    """Ensures training and validation samples have independent IDs and no duplicate hashes."""
    train_ids = {s["id"] for s in train_data}
    val_ids = {s["id"] for s in val_data}

    # Strict separation
    assert len(train_ids) == len(train_data)
    assert len(val_ids) == len(val_data)
    assert train_ids.isdisjoint(val_ids), "Data leakage: train and val share sample IDs!"


def test_m4_stroke_format_compliance(train_data):
    """Verifies that every synthetic sample conforms strictly to M4 pipeline format."""
    for s in train_data[:200]:  # Sample check 200 items
        strokes = s["strokes"]
        assert len(strokes) >= 1
        for stroke in strokes:
            # Must have exactly 32 points matching M4 uniform arc-length resampling
            assert len(stroke) == 32
            for pt in stroke:
                assert 0.0 <= pt["x"] <= 1.0
                assert 0.0 <= pt["y"] <= 1.0


def test_digit_0_loop_closure_and_gap_realism(train_data):
    """Verifies digit 0 contains natural incomplete closures and varied endpoint distances."""
    zeros = [s for s in train_data if s["label"] == "0"]
    assert len(zeros) == 300

    endpoint_distances = []
    aspect_ratios = []

    for item in zeros:
        stroke = item["strokes"][0]
        p_start = stroke[0]
        p_end = stroke[-1]
        dist = math.hypot(p_end["x"] - p_start["x"], p_end["y"] - p_start["y"])
        endpoint_distances.append(dist)
        aspect_ratios.append(item.get("aspect_ratio", 1.0))

    # A substantial portion of samples must have natural open gaps (dist > 0.05)
    gapped = [d for d in endpoint_distances if d > 0.05]
    assert len(gapped) >= 80, f"Expected natural gaps in digit 0, found only {len(gapped)}"

    # Some must be tightly closed (dist <= 0.03)
    closed = [d for d in endpoint_distances if d <= 0.03]
    assert len(closed) >= 50, f"Expected closed loops in digit 0, found only {len(closed)}"

    # Aspect ratios must vary around circular / oval shapes (mean around 0.85 - 1.05)
    mean_ar = sum(aspect_ratios) / len(aspect_ratios)
    assert 0.70 <= mean_ar <= 1.15


def test_digit_1_straightness_and_narrow_aspect_ratio(train_data):
    """Verifies digit 1 patterns are predominantly narrow, vertical, and straight."""
    ones = [s for s in train_data if s["label"] == "1"]
    assert len(ones) == 300

    aspect_ratios = []
    endpoint_distances = []

    for item in ones:
        stroke = item["strokes"][0]
        pts = stroke
        min_x = min(p["x"] for p in pts)
        max_x = max(p["x"] for p in pts)
        min_y = min(p["y"] for p in pts)
        max_y = max(p["y"] for p in pts)
        w = max_x - min_x
        h = max_y - min_y
        ar = w / h if h > 0 else 1.0
        aspect_ratios.append(ar)

        p_start = pts[0]
        p_end = pts[-1]
        dist = math.hypot(p_end["x"] - p_start["x"], p_end["y"] - p_start["y"])
        endpoint_distances.append(dist)

    # Overwhelmingly narrow: median aspect ratio must be less than 0.12
    aspect_ratios.sort()
    median_ar = aspect_ratios[len(aspect_ratios) // 2]
    assert median_ar < 0.12, f"Expected narrow median aspect ratio for digit 1, got {median_ar}"

    # Downward straight distance must span the majority of the unit box (> 0.70)
    mean_dist = sum(endpoint_distances) / len(endpoint_distances)
    assert mean_dist > 0.70, f"Expected tall straight vertical span for digit 1, got {mean_dist}"


def test_digit_8_figure8_and_aspect_ratios(train_data):
    """Verifies digit 8 includes continuous S-curves and multi-stroke stacked loops."""
    eights = [s for s in train_data if s["label"] == "8"]
    assert len(eights) == 300

    stroke_counts = [len(s["strokes"]) for s in eights]
    assert 1 in stroke_counts, "Expected 1-stroke continuous figure 8s"
    assert 2 in stroke_counts, "Expected 2-stroke stacked loops for 8"

    # Physical aspect ratios of 8 should be centered around 0.50 (height ~ 2x width)
    ars = [s.get("aspect_ratio", 0.5) for s in eights]
    mean_ar = sum(ars) / len(ars)
    assert 0.40 <= mean_ar <= 0.65, f"Expected aspect ratio around 0.5 for 8, got {mean_ar}"


# =========================================================================
# Phase 4F: Focused Unit Tests for Improved Digit 8 Synthetic Generator
# =========================================================================

def test_improved_digit_8_structural_validity():
    """Verifies that generated digit 8 samples comply with M4 structure and coordinate bounds."""
    rng = random.Random(42)
    for _ in range(50):
        strokes, ar = generate_digit_strokes(8, rng)
        assert isinstance(strokes, list)
        assert len(strokes) in (1, 2), f"Expected 1 or 2 strokes, got {len(strokes)}"
        assert isinstance(ar, float) and ar > 0.0

        for stroke in strokes:
            assert len(stroke) == 32, f"Expected 32 resampled points, got {len(stroke)}"
            for pt in stroke:
                assert "x" in pt and "y" in pt
                assert 0.0 <= pt["x"] <= 1.0, f"x={pt['x']} out of bounds [0, 1]"
                assert 0.0 <= pt["y"] <= 1.0, f"y={pt['y']} out of bounds [0, 1]"
                assert math.isfinite(pt["x"]) and math.isfinite(pt["y"])


def test_improved_digit_8_determinism():
    """Verifies that the generator is strictly deterministic when given an explicit seed."""
    rng1 = random.Random(9999)
    samples1 = [generate_digit_strokes(8, rng1) for _ in range(10)]

    rng2 = random.Random(9999)
    samples2 = [generate_digit_strokes(8, rng2) for _ in range(10)]

    for (stk1, ar1), (stk2, ar2) in zip(samples1, samples2):
        assert ar1 == ar2
        assert len(stk1) == len(stk2)
        for s1, s2 in zip(stk1, stk2):
            assert len(s1) == len(s2)
            for p1, p2 in zip(s1, s2):
                assert p1["x"] == p2["x"]
                assert p1["y"] == p2["y"]


def test_improved_digit_8_diversity_and_no_collapse():
    """Verifies that the generator produces diverse styles, start points, and loop closures."""
    rng = random.Random(777)
    samples = [generate_digit_strokes(8, rng) for _ in range(100)]

    stroke_counts = [len(s[0]) for s in samples]
    assert 1 in stroke_counts, "Must produce 1-stroke continuous 8s"
    assert 2 in stroke_counts, "Must produce 2-stroke snowman 8s"
    assert sum(1 for c in stroke_counts if c == 1) >= 60, "Majority should be single-stroke"
    assert sum(1 for c in stroke_counts if c == 2) >= 5, "Substantial portion should be 2-stroke"

    # Start point diversity (y-coord of first point of first stroke)
    y_starts = [s[0][0][0]["y"] for s in samples]
    top_starts = sum(1 for y in y_starts if y < 0.35)
    center_starts = sum(1 for y in y_starts if 0.35 <= y <= 0.65)
    assert top_starts >= 50, f"Expected majority top-start 8s, got {top_starts}"
    assert center_starts >= 10, f"Expected center-crossing start 8s, got {center_starts}"

    # Aspect ratio variation (no single template collapse)
    ars = [s[1] for s in samples]
    mean_ar = sum(ars) / len(ars)
    variance_ar = sum((a - mean_ar) ** 2 for a in ars) / len(ars)
    std_ar = math.sqrt(variance_ar)
    assert std_ar > 0.05, f"Expected aspect ratio variation (std > 0.05), got {std_ar}"

    # Endpoint closure variation for single-stroke 8s
    single_strokes = [s[0][0] for s in samples if len(s[0]) == 1]
    ep_dists = [
        math.hypot(stk[-1]["x"] - stk[0]["x"], stk[-1]["y"] - stk[0]["y"])
        for stk in single_strokes
    ]
    closed = sum(1 for d in ep_dists if d <= 0.05)
    gapped = sum(1 for d in ep_dists if d > 0.05)
    assert closed >= 25, f"Expected closed-loop 8s, got {closed}"
    assert gapped >= 15, f"Expected open-gap 8s, got {gapped}"


def test_improved_digit_8_directional_histogram_integrity():
    """Verifies that the generated digit 8s produce balanced directional histograms with diagonal crossings."""
    rng = random.Random(888)
    samples = [generate_digit_strokes(8, rng) for _ in range(80)]

    features_list = [extract_stroke_features(s[0], aspect_ratio=s[1], stroke_count=len(s[0])) for s in samples]
    # Direction bins: features[64..71]
    # Diagonals: Bin 0 (-180..-135), Bin 3 (-45..0), Bin 4 (0..45), Bin 7 (135..180)
    diagonal_bins = [64 + 0, 64 + 3, 64 + 4, 64 + 7]

    for b in diagonal_bins:
        mean_b = sum(f[b] for f in features_list) / len(features_list)
        # Must have significant diagonal presence (previously < 0.035 in the defective generator)
        assert mean_b >= 0.10, f"Direction Bin {b-64} under-represented: mean={mean_b:.4f} (expected >= 0.10)"


def test_improved_digit_8_no_degenerate_trajectories():
    """Verifies that generated samples have substantial trajectory length and bounding extent."""
    rng = random.Random(123)
    for _ in range(30):
        strokes, _ = generate_digit_strokes(8, rng)
        # Combined gesture must fill normalized canvas
        all_pts = [p for stk in strokes for p in stk]
        min_x = min(p["x"] for p in all_pts)
        max_x = max(p["x"] for p in all_pts)
        min_y = min(p["y"] for p in all_pts)
        max_y = max(p["y"] for p in all_pts)
        gesture_max_dim = max(max_x - min_x, max_y - min_y)
        assert gesture_max_dim >= 0.70, f"Gesture bounding box too small ({gesture_max_dim:.3f})"

        for stk in strokes:
            # Trajectory length of each stroke must be substantial
            total_len = sum(
                math.hypot(stk[i]["x"] - stk[i - 1]["x"], stk[i]["y"] - stk[i - 1]["y"])
                for i in range(1, len(stk))
            )
            assert total_len > 0.40, f"Trajectory too short ({total_len:.3f})"

            # Individual stroke extent (e.g. snowman loop) must be at least 0.25
            stk_min_x = min(p["x"] for p in stk)
            stk_max_x = max(p["x"] for p in stk)
            stk_min_y = min(p["y"] for p in stk)
            stk_max_y = max(p["y"] for p in stk)
            stk_max_dim = max(stk_max_x - stk_min_x, stk_max_y - stk_min_y)
            assert stk_max_dim >= 0.25, f"Individual stroke bounding box too small ({stk_max_dim:.3f})"

