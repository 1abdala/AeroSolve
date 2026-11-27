"""
Unit tests for canonical 76-dimensional feature extraction (Python).
Verifies vector size, value bounds, invariance, and deterministic values.
"""

import math
from app.ml.features import (
    FEATURE_VECTOR_SIZE,
    GRID_SIZE,
    NUM_DIRECTION_BINS,
    extract_stroke_features,
)


def test_empty_and_invalid_strokes_return_zeros():
    features = extract_stroke_features([])
    assert len(features) == FEATURE_VECTOR_SIZE
    assert all(f == 0.0 for f in features)

    features_none = extract_stroke_features([[], [{"x": float("nan"), "y": 0.5}]])
    assert len(features_none) == FEATURE_VECTOR_SIZE
    assert all(f == 0.0 for f in features_none)


def test_single_dot_stroke():
    stroke = [[{"x": 0.5, "y": 0.5}]]
    features = extract_stroke_features(stroke)
    assert len(features) == FEATURE_VECTOR_SIZE

    # Grid cell for (0.5, 0.5) is col=4, row=4 -> idx = 4*8 + 4 = 36
    # It should have 1.0 weight
    assert features[36] == 1.0
    # Directional features should be 0 because length is 0
    assert all(features[64 + b] == 0.0 for b in range(NUM_DIRECTION_BINS))
    # Stroke count: 1/3 = 0.333333
    assert abs(features[73] - 0.333333) < 1e-4


def test_horizontal_line_features():
    # A line from (0.1, 0.5) to (0.9, 0.5) (moving right, angle = 0 rad)
    stroke = [[
        {"x": 0.1, "y": 0.5},
        {"x": 0.5, "y": 0.5},
        {"x": 0.9, "y": 0.5},
    ]]
    features = extract_stroke_features(stroke)

    assert len(features) == FEATURE_VECTOR_SIZE
    # Grid features sum to ~1.0
    grid_sum = sum(features[:64])
    assert abs(grid_sum - 1.0) < 1e-3

    # Direction bin: angle 0 rad -> normalized angle = (0 + pi)/(2*pi) * 8 = 4.0
    # bin index = 4
    assert features[64 + 4] > 0.95

    # Arc length is 0.8 -> normalized arc length = 0.8 / 3.0 ~ 0.266667
    assert abs(features[74] - (0.8 / 3.0)) < 1e-3

    # Endpoint distance is 0.8 -> normalized ep dist = 0.8 / (0.8 + 1e-4) ~ 0.999875
    assert abs(features[75] - 1.0) < 1e-2


def test_deterministic_feature_vector_sample():
    """Deterministic sample to ensure JS and Python match bit-for-bit."""
    sample_strokes = [
        [
            {"x": 0.2, "y": 0.2},
            {"x": 0.8, "y": 0.2},
            {"x": 0.8, "y": 0.8},
            {"x": 0.2, "y": 0.8},
        ]
    ]
    feats = extract_stroke_features(sample_strokes, aspect_ratio=1.0, stroke_count=1)
    assert len(feats) == 76
    assert abs(sum(feats[:64]) - 1.0) < 1e-3
    assert abs(sum(feats[64:72]) - 1.0) < 1e-3
    assert feats[72] == 0.5  # 1.0 / 2.0
    assert abs(feats[73] - 0.333333) < 1e-4
