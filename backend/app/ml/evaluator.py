"""
AeroSolve — Milestone M5: Local Symbol Recognition
Evaluation Metrics & Confusion Matrix Module
"""

from typing import Any, Dict, List, Tuple


def compute_confusion_matrix(
    y_true: List[str],
    y_pred: List[str],
    class_names: List[str],
) -> List[List[int]]:
    """
    Computes a 10x10 confusion matrix.
    Rows: Ground Truth
    Columns: Predicted
    """
    class_to_idx = {name: i for i, name in enumerate(class_names)}
    n = len(class_names)
    matrix = [[0] * n for _ in range(n)]

    for true_label, pred_label in zip(y_true, y_pred):
        if true_label in class_to_idx and pred_label in class_to_idx:
            r = class_to_idx[true_label]
            c = class_to_idx[pred_label]
            matrix[r][c] += 1

    return matrix


def compute_classification_metrics(
    y_true: List[str],
    y_pred: List[str],
    y_top3: List[List[str]],
    class_names: List[str],
) -> Dict[str, Any]:
    """
    Computes top-1 accuracy, top-3 accuracy, and per-class Precision, Recall, and F1.
    """
    total = len(y_true)
    if total == 0:
        return {
            "total": 0,
            "top1_accuracy": 0.0,
            "top3_accuracy": 0.0,
            "per_class": {},
            "macro_f1": 0.0,
        }

    correct_top1 = sum(1 for yt, yp in zip(y_true, y_pred) if yt == yp)
    correct_top3 = sum(1 for yt, top3 in zip(y_true, y_top3) if yt in top3)

    cm = compute_confusion_matrix(y_true, y_pred, class_names)
    n = len(class_names)

    per_class = {}
    f1_list = []

    for i, name in enumerate(class_names):
        tp = cm[i][i]
        fp = sum(cm[r][i] for r in range(n) if r != i)
        fn = sum(cm[i][c] for c in range(n) if c != i)
        support = tp + fn

        prec = (tp / (tp + fp)) if (tp + fp) > 0 else 0.0
        rec = (tp / (tp + fn)) if (tp + fn) > 0 else 0.0
        f1 = (2.0 * prec * rec / (prec + rec)) if (prec + rec) > 0 else 0.0

        per_class[name] = {
            "precision": round(prec, 4),
            "recall": round(rec, 4),
            "f1_score": round(f1, 4),
            "support": support,
        }
        if support > 0:
            f1_list.append(f1)

    macro_f1 = (sum(f1_list) / len(f1_list)) if f1_list else 0.0

    return {
        "total": total,
        "top1_accuracy": round(correct_top1 / total, 4),
        "top3_accuracy": round(correct_top3 / total, 4),
        "macro_f1": round(macro_f1, 4),
        "per_class": per_class,
        "confusion_matrix": cm,
    }


def format_evaluation_report(
    metrics: Dict[str, Any],
    class_names: List[str],
    model_name: str = "Model",
) -> str:
    """Formats metrics and 10x10 confusion matrix into a readable report."""
    lines = []
    lines.append(f"==================================================")
    lines.append(f"  AeroSolve M5 Recognition Scorecard: {model_name}")
    lines.append(f"==================================================")
    lines.append(f"Total Evaluated Samples: {metrics['total']}")
    lines.append(f"Top-1 Accuracy:          {metrics['top1_accuracy'] * 100:.2f}%")
    lines.append(f"Top-3 Accuracy:          {metrics['top3_accuracy'] * 100:.2f}%")
    lines.append(f"Macro F1-Score:          {metrics['macro_f1'] * 100:.2f}%")
    lines.append("")
    lines.append("Per-Class Metrics:")
    lines.append(f"{'Class':<8}{'Precision':<12}{'Recall':<12}{'F1-Score':<12}{'Support':<8}")
    lines.append("-" * 52)
    for name in class_names:
        stats = metrics["per_class"].get(name, {"precision": 0, "recall": 0, "f1_score": 0, "support": 0})
        lines.append(
            f"{name:<8}{stats['precision'] * 100:>8.1f}%   {stats['recall'] * 100:>8.1f}%   {stats['f1_score'] * 100:>8.1f}%   {stats['support']:>6}"
        )

    lines.append("")
    lines.append("10x10 Confusion Matrix (Rows: Ground Truth, Cols: Predicted):")
    header = "       " + " ".join(f"{c:>4}" for c in class_names)
    lines.append(header)
    lines.append("     " + "-" * (5 * len(class_names) + 2))

    cm = metrics["confusion_matrix"]
    for i, name in enumerate(class_names):
        row_str = f"{name:>4} | " + " ".join(f"{cm[i][j]:>4}" for j in range(len(class_names)))
        lines.append(row_str)

    lines.append("==================================================")
    return "\n".join(lines)
