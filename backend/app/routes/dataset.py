"""
AeroSolve — Milestone M5: Dataset Collection Route
Handles storage, retrieval, and synchronization of genuine air-written samples.
Hardened with atomic file writes, automatic timestamped backups, and safe clearing controls.
"""

from datetime import datetime, timezone
import json
import os
import tempfile
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/dataset", tags=["Dataset"])

DATASET_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "data",
    "genuine_collected.json",
)


class SampleModel(BaseModel):
    id: str
    label: str
    digit: int
    strokes: List[List[Dict[str, Any]]]
    stroke_count: int
    aspect_ratio: Optional[float] = 1.0
    point_count: int
    created_at: str
    is_synthetic: bool = False
    capture_source: str = "webcam_m4_pipeline"
    session_id: Optional[str] = "session_1"


class SyncCorpusRequest(BaseModel):
    samples: List[SampleModel]


def _get_backup_dir() -> str:
    """Return the path to the dataset backup directory, co-located with DATASET_FILE."""
    return os.path.join(os.path.dirname(DATASET_FILE), "backups")


def _read_dataset() -> List[Dict[str, Any]]:
    """Safely read samples from dataset file. Returns empty list if missing or corrupted."""
    if not os.path.exists(DATASET_FILE):
        return []
    try:
        with open(DATASET_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception:
        return []


def _create_backup(samples: List[Dict[str, Any]], reason: str = "auto") -> Optional[str]:
    """
    Create an immutable timestamped backup of the current samples before destructive operations.
    Returns the absolute path of the created backup file, or None if samples is empty.
    """
    if not samples:
        return None

    backup_dir = _get_backup_dir()
    os.makedirs(backup_dir, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
    backup_filename = f"genuine_collected_{reason}_{timestamp}.json"
    backup_path = os.path.join(backup_dir, backup_filename)

    # Perform atomic write of backup
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile("w", dir=backup_dir, delete=False, encoding="utf-8", suffix=".tmp") as tf:
            temp_path = tf.name
            json.dump(samples, tf, indent=2)
            tf.flush()
            os.fsync(tf.fileno())
        os.replace(temp_path, backup_path)
        return backup_path
    except Exception:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass
        return None


def _atomic_write_dataset(samples: List[Dict[str, Any]]) -> None:
    """
    Atomically write samples to DATASET_FILE using a temporary file in the same directory.
    Guarantees that an interrupted write cannot leave the primary dataset file truncated or corrupted.
    """
    target_dir = os.path.dirname(DATASET_FILE)
    os.makedirs(target_dir, exist_ok=True)

    temp_path = None
    try:
        with tempfile.NamedTemporaryFile("w", dir=target_dir, delete=False, encoding="utf-8", suffix=".tmp") as tf:
            temp_path = tf.name
            json.dump(samples, tf, indent=2)
            tf.flush()
            os.fsync(tf.fileno())
        os.replace(temp_path, DATASET_FILE)
    except Exception:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass
        raise


@router.get("/samples")
def get_all_samples():
    """Retrieve all collected genuine samples and distribution summary."""
    samples = _read_dataset()
    counts = {str(d): 0 for d in range(10)}
    sessions = set()
    for s in samples:
        lbl = str(s.get("label", ""))
        if lbl in counts:
            counts[lbl] += 1
        if "session_id" in s:
            sessions.add(s["session_id"])

    return {
        "status": "ok",
        "total_samples": len(samples),
        "per_digit_counts": counts,
        "sessions": sorted(list(sessions)),
        "samples": samples,
    }


@router.get("/backups")
def list_backups():
    """List available dataset backups and metadata."""
    backup_dir = _get_backup_dir()
    if not os.path.exists(backup_dir):
        return {"backups": [], "total_backups": 0}

    backups = []
    for f in sorted(os.listdir(backup_dir), reverse=True):
        if f.endswith(".json"):
            p = os.path.join(backup_dir, f)
            try:
                mtime = os.path.getmtime(p)
                backups.append({
                    "filename": f,
                    "size_bytes": os.path.getsize(p),
                    "created_at": datetime.fromtimestamp(mtime, timezone.utc).isoformat(),
                })
            except OSError:
                continue

    return {"backups": backups, "total_backups": len(backups)}


@router.post("/sample")
def save_single_sample(sample: SampleModel):
    """
    Save or append a single genuine air-written sample.
    If replacing an existing sample ID, backs up the existing dataset first.
    """
    samples = _read_dataset()
    sample_dict = sample.model_dump()

    # Avoid duplicate IDs
    existing_idx = next((i for i, s in enumerate(samples) if s.get("id") == sample_dict["id"]), None)
    backup_path = None

    if existing_idx is not None:
        # Overwriting existing sample: create backup first
        backup_path = _create_backup(samples, reason="before_sample_overwrite")
        samples[existing_idx] = sample_dict
    else:
        samples.append(sample_dict)

    _atomic_write_dataset(samples)
    return {
        "status": "saved",
        "sample_id": sample.id,
        "total_count": len(samples),
        "digit": sample.digit,
        "overwritten": existing_idx is not None,
        "backup_created": backup_path is not None,
        "backup_file": os.path.basename(backup_path) if backup_path else None,
    }


@router.post("/sync")
def sync_corpus(payload: SyncCorpusRequest):
    """
    Bulk merge a list of samples into backend storage.
    Safeguards:
      - Rejects or safely ignores empty client datasets if server is already populated.
      - Backs up existing data if any existing records are overwritten.
      - Writes atomically to disk.
    """
    existing_samples = _read_dataset()

    # Safeguard 1: Prevent empty client dataset from silently wiping or modifying populated server data
    if len(payload.samples) == 0:
        if len(existing_samples) > 0:
            return {
                "status": "skipped",
                "message": f"Client payload is empty; preserved {len(existing_samples)} existing server samples.",
                "new_samples_added": 0,
                "overwritten_samples": 0,
                "total_samples": len(existing_samples),
            }
        return {
            "status": "synced",
            "new_samples_added": 0,
            "overwritten_samples": 0,
            "total_samples": 0,
        }

    existing_ids = {s.get("id"): idx for idx, s in enumerate(existing_samples)}
    merged_samples = list(existing_samples)
    merged_count = 0
    overwrite_count = 0

    for s in payload.samples:
        s_dict = s.model_dump()
        s_id = s_dict["id"]
        if s_id in existing_ids:
            merged_samples[existing_ids[s_id]] = s_dict
            overwrite_count += 1
        else:
            merged_samples.append(s_dict)
            existing_ids[s_id] = len(merged_samples) - 1
            merged_count += 1

    # Safeguard 2: Create backup before overwriting any populated data
    backup_path = None
    if overwrite_count > 0 and len(existing_samples) > 0:
        backup_path = _create_backup(existing_samples, reason="before_sync_overwrite")

    _atomic_write_dataset(merged_samples)
    return {
        "status": "synced",
        "new_samples_added": merged_count,
        "overwritten_samples": overwrite_count,
        "total_samples": len(merged_samples),
        "backup_created": backup_path is not None,
        "backup_file": os.path.basename(backup_path) if backup_path else None,
    }


@router.delete("/clear")
def clear_samples(
    confirm: Optional[str] = Query(None, description="Confirmation token ('true' or 'CONFIRM_CLEAR_DATASET') required to clear populated dataset"),
    x_confirm_clear: Optional[str] = Header(None, alias="X-Confirm-Clear", description="Header confirmation token"),
):
    """
    Clear all collected samples from backend storage.
    Safeguards:
      - If dataset is populated, requires explicit confirmation (?confirm=CONFIRM_CLEAR_DATASET or X-Confirm-Clear: true).
      - Automatically creates a timestamped backup before clearing any populated dataset.
    """
    samples = _read_dataset()
    is_confirmed = (
        confirm in ("true", "CONFIRM_CLEAR_DATASET", "1")
        or x_confirm_clear in ("true", "CONFIRM_CLEAR_DATASET", "1")
    )

    if len(samples) > 0 and not is_confirmed:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Refusing to clear populated dataset ({len(samples)} samples) without explicit confirmation. "
                "Pass query parameter ?confirm=CONFIRM_CLEAR_DATASET or header 'X-Confirm-Clear: true'."
            ),
        )

    backup_path = None
    if len(samples) > 0:
        backup_path = _create_backup(samples, reason="before_clear")

    _atomic_write_dataset([])
    return {
        "status": "cleared",
        "total_samples": 0,
        "backup_created": backup_path is not None,
        "backup_file": os.path.basename(backup_path) if backup_path else None,
    }
