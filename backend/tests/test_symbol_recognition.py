"""
Pytest suite for Milestone M5: Local Symbol Recognition (Backend)
Tests Candidate A, Candidate B, Evaluator, and Model Export/Import.
"""

from app.ml.evaluator import (
    compute_classification_metrics,
    compute_confusion_matrix,
)
from app.ml.feature_classifier import FeatureMLPClassifier
from app.ml.features import extract_stroke_features
from app.ml.template_recognizer import (
    PointCloudTemplateRecognizer,
    resample_point_cloud,
)


def test_evaluator_metrics():
    class_names = ["0", "1", "2"]
    y_true = ["0", "1", "2", "0"]
    y_pred = ["0", "1", "1", "0"]
    y_top3 = [["0", "1", "2"], ["1", "0", "2"], ["1", "2", "0"], ["0", "2", "1"]]

    cm = compute_confusion_matrix(y_true, y_pred, class_names)
    assert cm == [
        [2, 0, 0],
        [0, 1, 0],
        [0, 1, 0],
    ]

    metrics = compute_classification_metrics(y_true, y_pred, y_top3, class_names)
    assert metrics["total"] == 4
    assert metrics["top1_accuracy"] == 0.75
    assert metrics["top3_accuracy"] == 1.0


def test_template_recognizer_prediction():
    rec = PointCloudTemplateRecognizer()
    rec.add_template(
        "1",
        "1_vertical",
        [[{"x": 0.5, "y": 0.1}, {"x": 0.5, "y": 0.9}]],
    )
    rec.add_template(
        "0",
        "0_circle",
        [[{"x": 0.2, "y": 0.2}, {"x": 0.8, "y": 0.2}, {"x": 0.8, "y": 0.8}, {"x": 0.2, "y": 0.8}, {"x": 0.2, "y": 0.2}]],
    )

    sample_1 = [[{"x": 0.5, "y": 0.15}, {"x": 0.5, "y": 0.85}]]
    res = rec.predict(sample_1)
    assert res["top_prediction"] == "1"
    assert res["confidence"] > 0.8
    assert len(res["candidates"]) == 3

    # Export / Import
    data = rec.export_to_json()
    imported = PointCloudTemplateRecognizer.from_json(data)
    assert len(imported.templates) == 2


def test_feature_mlp_forward_and_export():
    clf = FeatureMLPClassifier(hidden_dim=16, seed=123)
    sample_feat = [0.1] * 76

    res = clf.predict_features(sample_feat)
    assert "top_prediction" in res
    assert 0.0 <= res["confidence"] <= 1.0
    assert len(res["candidates"]) == 3
    assert len(res["all_scores"]) == 10

    # Test export to json and load from json
    exported = clf.export_to_json()
    assert exported["modelType"] == "feature_classifier_mlp"
    assert len(exported["weights"]["w1"]) == 16
    assert len(exported["weights"]["w2"]) == 10

    reloaded = FeatureMLPClassifier.from_json(exported)
    res_reloaded = reloaded.predict_features(sample_feat)
    assert res["top_prediction"] == res_reloaded["top_prediction"]
    assert abs(res["confidence"] - res_reloaded["confidence"]) < 1e-4
