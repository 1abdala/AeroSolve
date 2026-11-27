"""
AeroSolve — Milestone M5: Retraining Pipeline for Phase D
Retrains the Geometric Feature MLP Classifier using approved Phase 3 synthetic data
and evaluates on held-out genuine Session 2 data.
Exports retrained model to frontend assets and public models directory.
"""

import json
import math
import os
import random
import sys
import time
from typing import Any, Dict, List, Tuple

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.ml.evaluator import compute_classification_metrics, format_evaluation_report
from app.ml.feature_classifier import FeatureMLPClassifier, softmax
from app.ml.features import FEATURE_VECTOR_SIZE, extract_stroke_features


class FastFeatureMLPClassifier(FeatureMLPClassifier):
    """Optimized pure-Python MLP training without generator expression overhead."""

    def train_fast(
        self,
        train_data: List[Tuple[List[float], int]],
        val_data: List[Tuple[List[float], int]],
        epochs: int = 30,
        lr: float = 0.008,
        weight_decay: float = 0.0001,
        batch_size: int = 32,
    ) -> Dict[str, Any]:
        hidden_dim = self.hidden_dim
        input_dim = self.input_dim
        num_classes = self.num_classes

        # Moments
        m_w1 = [[0.0] * input_dim for _ in range(hidden_dim)]
        v_w1 = [[0.0] * input_dim for _ in range(hidden_dim)]
        m_b1 = [0.0] * hidden_dim
        v_b1 = [0.0] * hidden_dim

        m_w2 = [[0.0] * hidden_dim for _ in range(num_classes)]
        v_w2 = [[0.0] * hidden_dim for _ in range(num_classes)]
        m_b2 = [0.0] * num_classes
        v_b2 = [0.0] * num_classes

        beta1 = 0.9
        beta2 = 0.999
        eps = 1e-8
        t_step = 0
        rng = random.Random(1337)
        history = []

        w1 = self.w1
        b1 = self.b1
        w2 = self.w2
        b2 = self.b2

        n_samples = len(train_data)

        for epoch in range(epochs):
            shuffled = list(train_data)
            rng.shuffle(shuffled)
            total_loss = 0.0

            for b_start in range(0, n_samples, batch_size):
                b_end = min(b_start + batch_size, n_samples)
                batch = shuffled[b_start:b_end]
                b_size = len(batch)
                if b_size == 0:
                    continue

                grad_w1 = [[0.0] * input_dim for _ in range(hidden_dim)]
                grad_b1 = [0.0] * hidden_dim
                grad_w2 = [[0.0] * hidden_dim for _ in range(num_classes)]
                grad_b2 = [0.0] * num_classes

                for x, y in batch:
                    # Forward pass
                    h = [0.0] * hidden_dim
                    for j in range(hidden_dim):
                        w1_j = w1[j]
                        dot = b1[j]
                        for i in range(input_dim):
                            xi = x[i]
                            if xi != 0.0:
                                dot += w1_j[i] * xi
                        h[j] = dot if dot > 0.0 else 0.0

                    z = [0.0] * num_classes
                    max_z = -1e9
                    for k in range(num_classes):
                        w2_k = w2[k]
                        dot = b2[k]
                        for j in range(hidden_dim):
                            hj = h[j]
                            if hj > 0.0:
                                dot += w2_k[j] * hj
                        z[k] = dot
                        if dot > max_z:
                            max_z = dot

                    # Softmax
                    sum_exp = 0.0
                    p = [0.0] * num_classes
                    for k in range(num_classes):
                        ev = math.exp(z[k] - max_z)
                        p[k] = ev
                        sum_exp += ev
                    inv_sum = 1.0 / sum_exp if sum_exp > 1e-12 else 1.0
                    for k in range(num_classes):
                        p[k] *= inv_sum

                    # Cross-entropy loss
                    py = max(p[y], 1e-12)
                    total_loss += -math.log(py)

                    # Gradients
                    dz = [0.0] * num_classes
                    for k in range(num_classes):
                        dzk = p[k] - (1.0 if k == y else 0.0)
                        dz[k] = dzk
                        grad_b2[k] += dzk
                        gw2_k = grad_w2[k]
                        for j in range(hidden_dim):
                            hj = h[j]
                            if hj > 0.0:
                                gw2_k[j] += dzk * hj

                    # Backprop into hidden layer
                    for j in range(hidden_dim):
                        if h[j] <= 0.0:
                            continue
                        dh_j = 0.0
                        for k in range(num_classes):
                            dh_j += dz[k] * w2[k][j]

                        grad_b1[j] += dh_j
                        gw1_j = grad_w1[j]
                        for i in range(input_dim):
                            xi = x[i]
                            if xi != 0.0:
                                gw1_j[i] += dh_j * xi

                t_step += 1
                lr_t = lr * math.sqrt(1.0 - beta2 ** t_step) / (1.0 - beta1 ** t_step)
                inv_bs = 1.0 / b_size

                # Adam updates for W2, b2
                for k in range(num_classes):
                    gb = grad_b2[k] * inv_bs
                    m_b2[k] = beta1 * m_b2[k] + (1.0 - beta1) * gb
                    v_b2[k] = beta2 * v_b2[k] + (1.0 - beta2) * (gb * gb)
                    b2[k] -= lr_t * m_b2[k] / (math.sqrt(v_b2[k]) + eps)

                    w2_k = w2[k]
                    gw2_k = grad_w2[k]
                    mw2_k = m_w2[k]
                    vw2_k = v_w2[k]
                    for j in range(hidden_dim):
                        gw = (gw2_k[j] * inv_bs) + weight_decay * w2_k[j]
                        mw2_k[j] = beta1 * mw2_k[j] + (1.0 - beta1) * gw
                        vw2_k[j] = beta2 * vw2_k[j] + (1.0 - beta2) * (gw * gw)
                        w2_k[j] -= lr_t * mw2_k[j] / (math.sqrt(vw2_k[j]) + eps)

                # Adam updates for W1, b1
                for j in range(hidden_dim):
                    gb = grad_b1[j] * inv_bs
                    m_b1[j] = beta1 * m_b1[j] + (1.0 - beta1) * gb
                    v_b1[j] = beta2 * v_b1[j] + (1.0 - beta2) * (gb * gb)
                    b1[j] -= lr_t * m_b1[j] / (math.sqrt(v_b1[j]) + eps)

                    w1_j = w1[j]
                    gw1_j = grad_w1[j]
                    mw1_j = m_w1[j]
                    vw1_j = v_w1[j]
                    for i in range(input_dim):
                        gw = (gw1_j[i] * inv_bs) + weight_decay * w1_j[i]
                        mw1_j[i] = beta1 * mw1_j[i] + (1.0 - beta1) * gw
                        vw1_j[i] = beta2 * vw1_j[i] + (1.0 - beta2) * (gw * gw)
                        w1_j[i] -= lr_t * mw1_j[i] / (math.sqrt(vw1_j[i]) + eps)

            avg_loss = total_loss / n_samples
            val_acc = 0.0
            if val_data and ((epoch + 1) % 5 == 0 or epoch == epochs - 1):
                val_correct = sum(
                    1 for x, y in val_data[:200] if self.predict_features(x)["top_prediction"] == str(y)
                )
                val_acc = val_correct / 200.0
                print(f"  Epoch {epoch + 1}/{epochs} - loss: {avg_loss:.4f} - val_acc: {val_acc*100:.1f}%", flush=True)

            history.append({"epoch": epoch + 1, "loss": round(avg_loss, 4), "val_acc": round(val_acc, 4)})

        return {"epochs": epochs, "final_loss": round(avg_loss, 4), "history": history}


def main():
    print("=" * 70)
    print("  AeroSolve Milestone M5: Phase D Model Retraining & Audit")
    print("=" * 70)

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    data_dir = os.path.join(base_dir, "backend", "data")

    # 1. Load datasets
    syn_train_path = os.path.join(data_dir, "synthetic_train.json")
    syn_val_path = os.path.join(data_dir, "synthetic_val.json")
    genuine_path = os.path.join(data_dir, "genuine_collected.json")

    with open(syn_train_path, "r", encoding="utf-8") as f:
        syn_train = json.load(f)
    with open(syn_val_path, "r", encoding="utf-8") as f:
        syn_val = json.load(f)
    with open(genuine_path, "r", encoding="utf-8") as f:
        genuine = json.load(f)

    print(f"Dataset Counts:")
    print(f"  - Synthetic Train: {len(syn_train)} samples (240/digit across 0-9)")
    print(f"  - Synthetic Val:   {len(syn_val)} samples (80/digit across 0-9)")
    print(f"  - Genuine Held-Out:{len(genuine)} samples (13 ones, 8 twos, Session 2)")

    # 2. Extract features
    print("\nExtracting 76-dimensional geometric features...")
    t0 = time.time()
    train_tuples = []
    for s in syn_train:
        f = extract_stroke_features(s["strokes"], aspect_ratio=s.get("aspect_ratio"), stroke_count=s.get("stroke_count"))
        train_tuples.append((f, int(s["label"])))

    val_tuples = []
    for s in syn_val:
        f = extract_stroke_features(s["strokes"], aspect_ratio=s.get("aspect_ratio"), stroke_count=s.get("stroke_count"))
        val_tuples.append((f, int(s["label"])))

    print(f"Features extracted in {time.time() - t0:.2f}s.")

    # 3. Train MLP
    print("\nTraining FastFeatureMLPClassifier (76 -> 48 -> 10)...")
    clf = FastFeatureMLPClassifier(input_dim=FEATURE_VECTOR_SIZE, hidden_dim=48, num_classes=10, seed=42)
    clf.train_fast(
        train_data=train_tuples,
        val_data=val_tuples,
        epochs=30,
        lr=0.008,
        weight_decay=0.0001,
        batch_size=32,
    )

    # 4. Comprehensive Evaluation on Synthetic Val
    print("\n--- Evaluating on Synthetic Validation Set (800 samples) ---")
    class_names = [str(i) for i in range(10)]
    y_true_val = [str(y) for _, y in val_tuples]
    y_pred_val = []
    y_top3_val = []
    for x, _ in val_tuples:
        res = clf.predict_features(x)
        y_pred_val.append(res["top_prediction"])
        y_top3_val.append([c["label"] for c in res["candidates"]])

    val_metrics = compute_classification_metrics(y_true_val, y_pred_val, y_top3_val, class_names)
    print(f"Synthetic Val Top-1 Accuracy: {val_metrics['top1_accuracy']*100:.2f}%")
    print(f"Synthetic Val Top-3 Accuracy: {val_metrics['top3_accuracy']*100:.2f}%")
    print(f"Synthetic Val Macro F1:       {val_metrics['macro_f1']*100:.2f}%")

    print("\nPer-Class Performance on Synthetic Val:")
    for d in range(10):
        cd = val_metrics['per_class'][str(d)]
        print(f"  Digit {d}: Precision={cd['precision']*100:.1f}%, Recall={cd['recall']*100:.1f}%, F1={cd['f1_score']*100:.1f}% (Support={cd['support']})")

    # 5. Held-Out Genuine Session 2 Evaluation
    print("\n--- Evaluating on Held-Out Genuine Session 2 Air-Writing Samples (21 samples) ---")
    gen_true = []
    gen_pred = []
    gen_top3 = []
    for s in genuine:
        f = extract_stroke_features(s["strokes"], aspect_ratio=s.get("aspect_ratio"), stroke_count=s.get("stroke_count"))
        res = clf.predict_features(f)
        gen_true.append(s["label"])
        gen_pred.append(res["top_prediction"])
        gen_top3.append([c["label"] for c in res["candidates"]])
        print(f"  Sample {s['id']}: True={s['label']} -> Pred={res['top_prediction']} (Conf={res['confidence']*100:.1f}%) Candidates={[c['label'] for c in res['candidates']]}")

    gen_correct = sum(1 for t, p in zip(gen_true, gen_pred) if t == p)
    print(f"\nGenuine Held-Out Session 2 Accuracy: {gen_correct}/{len(gen_true)} ({gen_correct/len(gen_true)*100:.1f}%)")

    # 6. Test Specific Weakness Digits from Investigation:
    print("\n--- Testing Specific Hand-Drawn Styles for Weakness Digits (4, 9, 8, 5) ---")
    # Style: Natural continuous digit 9
    loop_9 = [{'x': 0.5 + 0.18 * math.cos(t), 'y': 0.35 + 0.18 * math.sin(t)} for t in [i * 2 * math.pi / 20 for i in range(21)]]
    stem_9 = [{'x': 0.68, 'y': 0.35 + (0.55 * i) / 10} for i in range(11)]
    stroke_9 = [loop_9 + stem_9]
    f_9 = extract_stroke_features(stroke_9)
    res_9 = clf.predict_features(f_9)
    print(f"  Human Continuous 9: Predicted='{res_9['top_prediction']}' (Conf={res_9['confidence']*100:.1f}%) Top3={[c['label'] for c in res_9['candidates']]}")

    # Style: 2-stroke digit 4
    stroke_4_1 = [{'x': 0.6, 'y': 0.15}, {'x': 0.3, 'y': 0.6}, {'x': 0.75, 'y': 0.6}]
    stroke_4_2 = [{'x': 0.6, 'y': 0.35}, {'x': 0.6, 'y': 0.85}]
    f_4 = extract_stroke_features([stroke_4_1, stroke_4_2], stroke_count=2)
    res_4 = clf.predict_features(f_4)
    print(f"  2-Stroke 4:        Predicted='{res_4['top_prediction']}' (Conf={res_4['confidence']*100:.1f}%) Top3={[c['label'] for c in res_4['candidates']]}")

    # Style: 2-stroke digit 5
    stroke_5_1 = [{'x': 0.6, 'y': 0.2}, {'x': 0.35, 'y': 0.2}, {'x': 0.35, 'y': 0.5}, {'x': 0.65, 'y': 0.65}, {'x': 0.35, 'y': 0.85}]
    stroke_5_2 = [{'x': 0.35, 'y': 0.2}, {'x': 0.7, 'y': 0.2}]
    f_5 = extract_stroke_features([stroke_5_1, stroke_5_2], stroke_count=2)
    res_5 = clf.predict_features(f_5)
    print(f"  2-Stroke 5:        Predicted='{res_5['top_prediction']}' (Conf={res_5['confidence']*100:.1f}%) Top3={[c['label'] for c in res_5['candidates']]}")

    # Style: Digit 8 with open top gap (15% gap)
    stroke_8 = [{'x': 0.5 + 0.18 * math.sin(t), 'y': 0.5 + 0.35 * math.sin(t) * math.cos(t)} for t in [i * 2 * math.pi / 24 for i in range(21)]]
    f_8 = extract_stroke_features([stroke_8])
    res_8 = clf.predict_features(f_8)
    print(f"  Open-loop 8:       Predicted='{res_8['top_prediction']}' (Conf={res_8['confidence']*100:.1f}%) Top3={[c['label'] for c in res_8['candidates']]}")

    # 7. Export Model Artifacts
    print("\n--- Exporting Retrained Model Artifacts ---")
    model_json = clf.export_to_json()
    model_json["trainedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    model_json["metadata"] = {
        "trainingSamples": len(syn_train),
        "syntheticValTop1": val_metrics["top1_accuracy"],
        "syntheticValTop3": val_metrics["top3_accuracy"],
        "genuineHeldOutTop1": gen_correct / len(gen_true),
        "datasetVersion": "Phase3_Isotropic_Mirrored_V2",
    }

    destinations = [
        os.path.join(base_dir, "frontend", "src", "assets", "symbol_model_v1.json"),
        os.path.join(base_dir, "frontend", "public", "models", "symbol_model_v1.json"),
    ]
    dist_models = os.path.join(base_dir, "frontend", "dist", "models")
    if os.path.exists(dist_models):
        destinations.append(os.path.join(dist_models, "symbol_model_v1.json"))

    for dst in destinations:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(dst, "w", encoding="utf-8") as f:
            json.dump(model_json, f, indent=2)
        print(f"  Exported: {dst}")

    print("\nModel retraining and deployment complete!")


if __name__ == "__main__":
    main()
