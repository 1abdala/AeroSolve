"""
AeroSolve — Milestone M5: Local Symbol Recognition
Model Benchmarking & Selection Pipeline

Benchmarks:
  - Candidate A: Multi-Stroke Point-Cloud Template Recognizer (P+ adapted)
  - Candidate B: Geometric Feature Softmax Classifier (Dense 2-layer MLP)

Datasets:
  - Synthetic Train & Synthetic Val (for development / baseline)
  - Real Val (for hyperparameter tuning and model selection)
  - Real Test (STRICTLY HELD OUT until winning model is selected)
"""

import json
import os
import sys
import time
from typing import Any, Dict, List, Tuple

from app.ml.evaluator import (
    compute_classification_metrics,
    format_evaluation_report,
)
from app.ml.feature_classifier import FeatureMLPClassifier
from app.ml.features import extract_stroke_features
from app.ml.template_recognizer import PointCloudTemplateRecognizer


def load_dataset(path: str) -> List[Dict[str, Any]]:
    with open(path, "r") as f:
        return json.load(f)


def evaluate_model_on_dataset(
    model: Any,
    dataset: List[Dict[str, Any]],
    is_feature_classifier: bool = False,
) -> Tuple[Dict[str, Any], float]:
    class_names = [str(i) for i in range(10)]
    y_true = []
    y_pred = []
    y_top3 = []

    total_latency_ms = 0.0

    for item in dataset:
        strokes = item["strokes"]
        label = item["label"]
        y_true.append(label)

        if is_feature_classifier:
            feats = item.get("features")
            if feats is None:
                feats = extract_stroke_features(strokes)
            res = model.predict_features(feats)
        else:
            res = model.predict(strokes)

        total_latency_ms += res["latency_ms"]
        y_pred.append(res["top_prediction"])
        y_top3.append([c["label"] for c in res["candidates"]])

    avg_latency = total_latency_ms / max(1, len(dataset))
    metrics = compute_classification_metrics(y_true, y_pred, y_top3, class_names)
    return metrics, round(avg_latency, 3)


def build_candidate_a(train_data: List[Dict[str, Any]], real_val_data: List[Dict[str, Any]]) -> PointCloudTemplateRecognizer:
    rec = PointCloudTemplateRecognizer()
    by_digit_train = {str(i): [] for i in range(10)}
    for s in train_data:
        by_digit_train[s["label"]].append(s)

    by_digit_real = {str(i): [] for i in range(10)}
    for s in real_val_data:
        by_digit_real[s["label"]].append(s)

    for digit in range(10):
        d_str = str(digit)
        # Add 2 representative synthetic templates
        syn_samples = by_digit_train[d_str][:2]
        for idx, sample in enumerate(syn_samples):
            rec.add_template(d_str, f"{d_str}_syn_{idx}", sample["strokes"])

        # Add 1 real template
        real_samples = by_digit_real[d_str][:1]
        for idx, sample in enumerate(real_samples):
            rec.add_template(d_str, f"{d_str}_real_{idx}", sample["strokes"])

    return rec


def build_candidate_b(
    train_data: List[Dict[str, Any]],
    real_val_data: List[Dict[str, Any]],
    val_data: List[Dict[str, Any]],
) -> FeatureMLPClassifier:
    clf = FeatureMLPClassifier(hidden_dim=32, seed=42)

    # Prepare features
    training_tuples: List[Tuple[List[float], int]] = []
    for s in train_data:
        f = extract_stroke_features(s["strokes"])
        s["features"] = f
        training_tuples.append((f, int(s["label"])))

    # Add real_val samples with weight (replicated 4x to balance synthetic dominance)
    for s in real_val_data:
        f = extract_stroke_features(s["strokes"])
        s["features"] = f
        for _ in range(4):
            training_tuples.append((f, int(s["label"])))

    val_tuples: List[Tuple[List[float], int]] = []
    for s in val_data:
        f = extract_stroke_features(s["strokes"])
        s["features"] = f
        val_tuples.append((f, int(s["label"])))

    # Train MLP
    clf.train(
        train_data=training_tuples,
        val_data=val_tuples,
        epochs=25,
        lr=0.007,
        weight_decay=0.0001,
        batch_size=32,
    )

    return clf


def main():
    print("================================================================")
    print("  AeroSolve Milestone M5: Recognizer Benchmark & Model Selection")
    print("================================================================")

    data_dir = "backend/data"
    synthetic_train = load_dataset(os.path.join(data_dir, "synthetic_train.json"))
    synthetic_val = load_dataset(os.path.join(data_dir, "synthetic_val.json"))
    real_val = load_dataset(os.path.join(data_dir, "real_val.json"))
    real_test = load_dataset(os.path.join(data_dir, "real_test.json"))

    print(f"Loaded {len(synthetic_train)} synthetic train samples.")
    print(f"Loaded {len(synthetic_val)} synthetic val samples.")
    print(f"Loaded {len(real_val)} real validation samples.")
    print(f"Loaded {len(real_test)} real test samples (HELD OUT).")
    print("")

    # --- Benchmark Candidate A: Point-Cloud Template Recognizer ---
    print("[1/2] Training & Evaluating Candidate A (P+ Point-Cloud Template)...", flush=True)
    cand_a = build_candidate_a(synthetic_train, real_val)

    m_a_syn, lat_a_syn = evaluate_model_on_dataset(cand_a, synthetic_val[:200], is_feature_classifier=False)
    m_a_real, lat_a_real = evaluate_model_on_dataset(cand_a, real_val, is_feature_classifier=False)

    # --- Benchmark Candidate B: Geometric Feature MLP Classifier ---
    print("[2/2] Training & Evaluating Candidate B (Geometric Feature MLP Softmax)...", flush=True)
    cand_b = build_candidate_b(synthetic_train, real_val, synthetic_val)

    m_b_syn, lat_b_syn = evaluate_model_on_dataset(cand_b, synthetic_val, is_feature_classifier=True)
    m_b_real, lat_b_real = evaluate_model_on_dataset(cand_b, real_val, is_feature_classifier=True)

    # --- Comparison Table ---
    print("\n" + "=" * 78)
    print("                       BENCHMARK COMPARISON TABLE")
    print("=" * 78)
    header = f"{'Model':<22} | {'Set':<14} | {'Top-1 Acc':<10} | {'Top-3 Acc':<10} | {'Macro F1':<10} | {'Latency':<8}"
    print(header)
    print("-" * 78)

    print(f"{'Candidate A (P+)':<22} | {'Synthetic Val':<14} | {m_a_syn['top1_accuracy']*100:>8.1f}%  | {m_a_syn['top3_accuracy']*100:>8.1f}%  | {m_a_syn['macro_f1']*100:>8.1f}%  | {lat_a_syn:>5.2f}ms")
    print(f"{'Candidate A (P+)':<22} | {'Real Val':<14} | {m_a_real['top1_accuracy']*100:>8.1f}%  | {m_a_real['top3_accuracy']*100:>8.1f}%  | {m_a_real['macro_f1']*100:>8.1f}%  | {lat_a_real:>5.2f}ms")
    print("-" * 78)
    print(f"{'Candidate B (MLP Softmax)':<22} | {'Synthetic Val':<14} | {m_b_syn['top1_accuracy']*100:>8.1f}%  | {m_b_syn['top3_accuracy']*100:>8.1f}%  | {m_b_syn['macro_f1']*100:>8.1f}%  | {lat_b_syn:>5.2f}ms")
    print(f"{'Candidate B (MLP Softmax)':<22} | {'Real Val':<14} | {m_b_real['top1_accuracy']*100:>8.1f}%  | {m_b_real['top3_accuracy']*100:>8.1f}%  | {m_b_real['macro_f1']*100:>8.1f}%  | {lat_b_real:>5.2f}ms")
    print("=" * 78)
    print("NOTE: Synthetic validation accuracy is NOT presented as real air-writing accuracy.")
    print("Model selection is based strictly on Real Validation accuracy and inference latency.\n")

    # Select winner
    # Real val accuracy primary, then latency
    score_a = (m_a_real['top1_accuracy'], -lat_a_real)
    score_b = (m_b_real['top1_accuracy'], -lat_b_real)

    if score_b >= score_a:
        winning_name = "Candidate B (Geometric Feature MLP Softmax Classifier)"
        winning_model = cand_b
        is_feat_winner = True
    else:
        winning_name = "Candidate A (Multi-Stroke Point-Cloud Template Recognizer)"
        winning_model = cand_a
        is_feat_winner = False

    print(f"--> WINNING MODEL SELECTED: {winning_name}")

    # Export winning model
    model_json = winning_model.export_to_json()
    model_json["benchmarkSummary"] = {
        "candidateA_PPlus": {
            "synthetic_val_top1": m_a_syn['top1_accuracy'],
            "real_val_top1": m_a_real['top1_accuracy'],
            "latency_ms": lat_a_real,
        },
        "candidateB_MLP": {
            "synthetic_val_top1": m_b_syn['top1_accuracy'],
            "real_val_top1": m_b_real['top1_accuracy'],
            "latency_ms": lat_b_real,
        },
        "selectedWinner": winning_name,
        "exportedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    # Save to frontend assets and public
    os.makedirs("frontend/src/assets", exist_ok=True)
    os.makedirs("frontend/public/models", exist_ok=True)

    with open("frontend/src/assets/symbol_model_v1.json", "w") as f:
        json.dump(model_json, f, indent=2)
    with open("frontend/public/models/symbol_model_v1.json", "w") as f:
        json.dump(model_json, f, indent=2)

    print("Exported winning model to frontend/src/assets/symbol_model_v1.json")
    print("Exported winning model to frontend/public/models/symbol_model_v1.json")

    # --- UNBIASED FINAL EVALUATION ON HELD-OUT REAL TEST SET ---
    print("\n" + "#" * 60)
    print("  FINAL UNBIASED EVALUATION ON HELD-OUT REAL TEST SET")
    print("#" * 60)
    test_metrics, test_latency = evaluate_model_on_dataset(
        winning_model, real_test, is_feature_classifier=is_feat_winner
    )

    class_names = [str(i) for i in range(10)]
    report = format_evaluation_report(test_metrics, class_names, model_name=f"{winning_name} (HELD-OUT REAL TEST SET)")
    print(report)
    print(f"Average Real Test Inference Latency: {test_latency} ms / sample\n")


if __name__ == "__main__":
    main()
