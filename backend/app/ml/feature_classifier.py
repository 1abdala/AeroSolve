"""
AeroSolve — Milestone M5: Local Symbol Recognition
Candidate B: Geometric Feature Softmax Classifier (2-Layer Dense MLP)

Architecture:
  Input (76 dims) -> Dense(32, ReLU) -> Dense(10, Softmax)
  Zero external dependencies: pure Python numerical implementation.
"""

import math
import random
import time
from typing import Any, Dict, List, Optional, Tuple

from app.ml.features import FEATURE_VECTOR_SIZE, extract_stroke_features


def softmax(logits: List[float]) -> List[float]:
    """Numerically stable softmax."""
    max_l = max(logits)
    exp_vals = [math.exp(x - max_l) for x in logits]
    sum_exp = sum(exp_vals)
    if sum_exp < 1e-12:
        return [1.0 / len(logits)] * len(logits)
    return [e / sum_exp for e in exp_vals]


class FeatureMLPClassifier:
    """
    2-Layer Multi-Layer Perceptron for 76-dimensional geometric stroke features.
    76 -> 32 (ReLU) -> 10 (Softmax)
    """

    def __init__(
        self,
        input_dim: int = FEATURE_VECTOR_SIZE,
        hidden_dim: int = 32,
        num_classes: int = 10,
        seed: int = 42,
    ):
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.num_classes = num_classes
        self.classes = [str(i) for i in range(num_classes)]

        # Initialize weights with He/Xavier uniform initialization
        rng = random.Random(seed)
        limit1 = math.sqrt(6.0 / (input_dim + hidden_dim))
        self.w1: List[List[float]] = [
            [rng.uniform(-limit1, limit1) for _ in range(input_dim)]
            for _ in range(hidden_dim)
        ]
        self.b1: List[float] = [0.0] * hidden_dim

        limit2 = math.sqrt(6.0 / (hidden_dim + num_classes))
        self.w2: List[List[float]] = [
            [rng.uniform(-limit2, limit2) for _ in range(hidden_dim)]
            for _ in range(num_classes)
        ]
        self.b2: List[float] = [0.0] * num_classes

    def forward(self, x: List[float]) -> Tuple[List[float], List[float], List[float]]:
        """
        Forward pass.
        Returns: (hidden_activations_h, logits_z, probabilities_p)
        """
        # Hidden layer: h = ReLU(W1 * x + b1)
        h = [0.0] * self.hidden_dim
        for j in range(self.hidden_dim):
            dot = sum(self.w1[j][i] * x[i] for i in range(self.input_dim)) + self.b1[j]
            h[j] = dot if dot > 0.0 else 0.0  # ReLU

        # Output layer: z = W2 * h + b2
        z = [0.0] * self.num_classes
        for k in range(self.num_classes):
            dot = sum(self.w2[k][j] * h[j] for j in range(self.hidden_dim)) + self.b2[k]
            z[k] = dot

        probs = softmax(z)
        return h, z, probs

    def predict_features(self, features: List[float]) -> Dict[str, Any]:
        """Inference from pre-computed feature vector."""
        t0 = time.perf_counter()
        _, _, probs = self.forward(features)

        sorted_indices = sorted(range(self.num_classes), key=lambda i: probs[i], reverse=True)
        top_idx = sorted_indices[0]
        top_prediction = self.classes[top_idx]
        confidence = round(probs[top_idx], 4)

        candidates = [
            {"label": self.classes[idx], "score": round(probs[idx], 4)}
            for idx in sorted_indices[:3]
        ]

        all_scores = {self.classes[i]: round(probs[i], 4) for i in range(self.num_classes)}
        latency_ms = round((time.perf_counter() - t0) * 1000, 3)

        return {
            "top_prediction": top_prediction,
            "confidence": confidence,
            "candidates": candidates,
            "all_scores": all_scores,
            "latency_ms": latency_ms,
        }

    def predict(
        self,
        strokes: List[List[Dict[str, float]]],
        aspect_ratio: Optional[float] = None,
        stroke_count: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Inference directly from stroke data."""
        t0 = time.perf_counter()
        feats = extract_stroke_features(strokes, aspect_ratio, stroke_count)
        result = self.predict_features(feats)
        result["latency_ms"] = round((time.perf_counter() - t0) * 1000, 3)
        return result

    def train(
        self,
        train_data: List[Tuple[List[float], int]],
        val_data: Optional[List[Tuple[List[float], int]]] = None,
        epochs: int = 50,
        lr: float = 0.005,
        weight_decay: float = 0.0001,
        batch_size: int = 32,
    ) -> Dict[str, Any]:
        """
        Train using mini-batch Adam optimization.
        train_data: list of (feature_vector, class_int_label)
        """
        # Adam moments
        m_w1 = [[0.0] * self.input_dim for _ in range(self.hidden_dim)]
        v_w1 = [[0.0] * self.input_dim for _ in range(self.hidden_dim)]
        m_b1 = [0.0] * self.hidden_dim
        v_b1 = [0.0] * self.hidden_dim

        m_w2 = [[0.0] * self.hidden_dim for _ in range(self.num_classes)]
        v_w2 = [[0.0] * self.hidden_dim for _ in range(self.num_classes)]
        m_b2 = [0.0] * self.num_classes
        v_b2 = [0.0] * self.num_classes

        beta1 = 0.9
        beta2 = 0.999
        eps = 1e-8
        t_step = 0

        rng = random.Random(1337)
        history = []

        for epoch in range(epochs):
            shuffled = list(train_data)
            rng.shuffle(shuffled)

            total_loss = 0.0
            n_samples = len(shuffled)

            for b_start in range(0, n_samples, batch_size):
                b_end = min(b_start + batch_size, n_samples)
                batch = shuffled[b_start:b_end]
                b_size = len(batch)
                if b_size == 0:
                    continue

                # Batch gradient accumulators
                grad_w1 = [[0.0] * self.input_dim for _ in range(self.hidden_dim)]
                grad_b1 = [0.0] * self.hidden_dim
                grad_w2 = [[0.0] * self.hidden_dim for _ in range(self.num_classes)]
                grad_b2 = [0.0] * self.num_classes

                for x, y in batch:
                    h, z, p = self.forward(x)

                    # Cross-entropy loss: -log(p[y])
                    p_y = max(p[y], 1e-12)
                    total_loss += -math.log(p_y)

                    # Output layer gradients: dL/dz_k = p_k - (1 if k == y else 0)
                    dz = [p[k] - (1.0 if k == y else 0.0) for k in range(self.num_classes)]

                    for k in range(self.num_classes):
                        grad_b2[k] += dz[k]
                        for j in range(self.hidden_dim):
                            grad_w2[k][j] += dz[k] * h[j]

                    # Backprop into hidden layer: dL/dh_j = sum_k (dz_k * W2_kj)
                    for j in range(self.hidden_dim):
                        if h[j] <= 0.0:
                            continue
                        dh_j = sum(dz[k] * self.w2[k][j] for k in range(self.num_classes))
                        grad_b1[j] += dh_j
                        for i in range(self.input_dim):
                            xi = x[i]
                            if xi != 0.0:
                                grad_w1[j][i] += dh_j * xi

                t_step += 1
                lr_t = lr * math.sqrt(1.0 - beta2 ** t_step) / (1.0 - beta1 ** t_step)

                # Adam updates for W2, b2
                for k in range(self.num_classes):
                    # b2
                    gb = grad_b2[k] / b_size
                    m_b2[k] = beta1 * m_b2[k] + (1 - beta1) * gb
                    v_b2[k] = beta2 * v_b2[k] + (1 - beta2) * (gb * gb)
                    self.b2[k] -= lr_t * m_b2[k] / (math.sqrt(v_b2[k]) + eps)

                    # w2
                    for j in range(self.hidden_dim):
                        gw = (grad_w2[k][j] / b_size) + weight_decay * self.w2[k][j]
                        m_w2[k][j] = beta1 * m_w2[k][j] + (1 - beta1) * gw
                        v_w2[k][j] = beta2 * v_w2[k][j] + (1 - beta2) * (gw * gw)
                        self.w2[k][j] -= lr_t * m_w2[k][j] / (math.sqrt(v_w2[k][j]) + eps)

                # Adam updates for W1, b1
                for j in range(self.hidden_dim):
                    # b1
                    gb = grad_b1[j] / b_size
                    m_b1[j] = beta1 * m_b1[j] + (1 - beta1) * gb
                    v_b1[j] = beta2 * v_b1[j] + (1 - beta2) * (gb * gb)
                    self.b1[j] -= lr_t * m_b1[j] / (math.sqrt(v_b1[j]) + eps)

                    # w1
                    for i in range(self.input_dim):
                        gw = (grad_w1[j][i] / b_size) + weight_decay * self.w1[j][i]
                        m_w1[j][i] = beta1 * m_w1[j][i] + (1 - beta1) * gw
                        v_w1[j][i] = beta2 * v_w1[j][i] + (1 - beta2) * (gw * gw)
                        self.w1[j][i] -= lr_t * m_w1[j][i] / (math.sqrt(v_w1[j][i]) + eps)

            avg_loss = total_loss / n_samples
            val_acc = 0.0
            if val_data and ((epoch + 1) % 5 == 0 or epoch == epochs - 1):
                val_subset = val_data[:200]
                val_correct = sum(
                    1 for x, y in val_subset if self.predict_features(x)["top_prediction"] == str(y)
                )
                val_acc = val_correct / len(val_subset)
                print(f"  Epoch {epoch + 1}/{epochs} - loss: {avg_loss:.4f} - val_acc: {val_acc*100:.1f}%", flush=True)

            history.append({"epoch": epoch + 1, "loss": round(avg_loss, 4), "val_acc": round(val_acc, 4)})

        return {"epochs": epochs, "final_loss": round(avg_loss, 4), "history": history}

    def export_to_json(self) -> Dict[str, Any]:
        """Export model weights to standard portable JSON format."""
        return {
            "modelType": "feature_classifier_mlp",
            "version": "1.0.0",
            "inputDim": self.input_dim,
            "hiddenDim": self.hidden_dim,
            "numClasses": self.num_classes,
            "classes": self.classes,
            "weights": {
                "w1": [[round(val, 6) for val in row] for row in self.w1],
                "b1": [round(val, 6) for val in self.b1],
                "w2": [[round(val, 6) for val in row] for row in self.w2],
                "b2": [round(val, 6) for val in self.b2],
            },
        }

    @classmethod
    def from_json(cls, data: Dict[str, Any]) -> "FeatureMLPClassifier":
        """Load model from exported JSON dictionary."""
        clf = cls(
            input_dim=data.get("inputDim", FEATURE_VECTOR_SIZE),
            hidden_dim=data.get("hiddenDim", 32),
            num_classes=data.get("numClasses", 10),
        )
        clf.classes = data.get("classes", [str(i) for i in range(10)])
        weights = data.get("weights", {})
        clf.w1 = weights.get("w1", clf.w1)
        clf.b1 = weights.get("b1", clf.b1)
        clf.w2 = weights.get("w2", clf.w2)
        clf.b2 = weights.get("b2", clf.b2)
        return clf
