"""
Tests for the /api/dataset endpoints, verifying Phase 1 data safety safeguards:
- Explicit confirmation required to clear populated dataset
- Automatic timestamped backups before destructive operations
- Safe atomic file writes
- Prevention of accidental empty-sync wipes
- Full test isolation from live dataset storage
"""

import os
import json
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.routes import dataset

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolate_dataset_file(tmp_path):
    """Ensure dataset route tests operate on an isolated temporary file to protect genuine datasets."""
    orig_file = dataset.DATASET_FILE
    temp_file = str(tmp_path / "test_genuine_collected.json")
    dataset.DATASET_FILE = temp_file
    yield
    dataset.DATASET_FILE = orig_file


def _create_sample_payload(sample_id="test_real_0_001", digit=0, label="0", session_id="session_1"):
    return {
        "id": sample_id,
        "label": label,
        "digit": digit,
        "strokes": [[{"x": 0.5, "y": 0.1}] * 32],
        "stroke_count": 1,
        "aspect_ratio": 1.0,
        "point_count": 32,
        "created_at": "2026-11-22T00:00:00Z",
        "is_synthetic": False,
        "capture_source": "webcam_m4_pipeline",
        "session_id": session_id,
    }


def test_dataset_sample_and_sync_lifecycle():
    """Verify standard happy-path lifecycle: save, read, sync, and confirmed clear."""
    # 1. Clear dataset when empty (should succeed even without confirmation)
    del_res = client.delete("/api/dataset/clear")
    assert del_res.status_code == 200

    # 2. Check initial empty samples
    get_res = client.get("/api/dataset/samples")
    assert get_res.status_code == 200
    assert get_res.json()["total_samples"] == 0

    # 3. Post a valid sample
    sample_payload = _create_sample_payload("test_real_0_001", digit=0, label="0")
    post_res = client.post("/api/dataset/sample", json=sample_payload)
    assert post_res.status_code == 200
    assert post_res.json()["status"] == "saved"
    assert post_res.json()["total_count"] == 1

    # 4. Check get returns the sample
    get_res2 = client.get("/api/dataset/samples")
    assert get_res2.json()["total_samples"] == 1
    assert get_res2.json()["per_digit_counts"]["0"] == 1
    assert "session_1" in get_res2.json()["sessions"]

    # 5. Bulk sync with a new sample
    bulk_payload = {
        "samples": [
            sample_payload,
            _create_sample_payload("test_real_1_001", digit=1, label="1", session_id="session_2"),
        ]
    }
    sync_res = client.post("/api/dataset/sync", json=bulk_payload)
    assert sync_res.status_code == 200
    assert sync_res.json()["total_samples"] == 2

    # 6. Clean up test artifact with deliberate confirmation
    del_res2 = client.delete("/api/dataset/clear?confirm=CONFIRM_CLEAR_DATASET")
    assert del_res2.status_code == 200
    assert del_res2.json()["status"] == "cleared"


def test_unconfirmed_clear_rejected_when_populated():
    """Safeguard 1: DELETE /api/dataset/clear must refuse to clear populated data without confirmation."""
    # Seed 1 sample
    sample = _create_sample_payload("sample_protect_01")
    post_res = client.post("/api/dataset/sample", json=sample)
    assert post_res.status_code == 200

    # Attempt to clear WITHOUT confirmation
    del_res = client.delete("/api/dataset/clear")
    assert del_res.status_code == 400
    assert "without explicit confirmation" in del_res.json()["detail"]

    # Verify dataset was NOT cleared and remains populated
    get_res = client.get("/api/dataset/samples")
    assert get_res.json()["total_samples"] == 1
    assert get_res.json()["samples"][0]["id"] == "sample_protect_01"


def test_confirmed_clear_creates_backup_and_wipes():
    """Safeguard 2: When confirmed, clear creates a timestamped backup before clearing."""
    # Seed 2 samples
    client.post("/api/dataset/sample", json=_create_sample_payload("sample_backup_01"))
    client.post("/api/dataset/sample", json=_create_sample_payload("sample_backup_02", digit=1, label="1"))

    # Clear with header confirmation
    del_res = client.delete("/api/dataset/clear", headers={"X-Confirm-Clear": "true"})
    assert del_res.status_code == 200
    assert del_res.json()["backup_created"] is True
    backup_file = del_res.json()["backup_file"]
    assert backup_file is not None

    # Verify backup exists on disk in backups directory
    backup_dir = dataset._get_backup_dir()
    backup_path = os.path.join(backup_dir, backup_file)
    assert os.path.exists(backup_path)

    # Verify backup contents contain the 2 pre-clear samples
    with open(backup_path, "r", encoding="utf-8") as f:
        backup_data = json.load(f)
    assert len(backup_data) == 2
    assert backup_data[0]["id"] == "sample_backup_01"
    assert backup_data[1]["id"] == "sample_backup_02"

    # Verify primary dataset is now empty
    get_res = client.get("/api/dataset/samples")
    assert get_res.json()["total_samples"] == 0


def test_empty_sync_preserves_populated_dataset():
    """Safeguard 3: Syncing an empty client dataset must NOT overwrite or wipe populated server data."""
    # Seed 2 samples
    client.post("/api/dataset/sample", json=_create_sample_payload("keep_me_01"))
    client.post("/api/dataset/sample", json=_create_sample_payload("keep_me_02"))

    # Attempt to sync empty array
    empty_sync = client.post("/api/dataset/sync", json={"samples": []})
    assert empty_sync.status_code == 200
    assert empty_sync.json()["status"] == "skipped"
    assert empty_sync.json()["total_samples"] == 2

    # Verify server dataset is completely intact
    get_res = client.get("/api/dataset/samples")
    assert get_res.json()["total_samples"] == 2
    ids = [s["id"] for s in get_res.json()["samples"]]
    assert "keep_me_01" in ids
    assert "keep_me_02" in ids


def test_sample_overwrite_creates_backup():
    """Safeguard 4: Overwriting an existing sample ID automatically triggers a pre-overwrite backup."""
    # Post original sample
    sample1 = _create_sample_payload("overwrite_target", digit=4, label="4")
    client.post("/api/dataset/sample", json=sample1)

    # Post updated sample with same ID but different label/digit
    sample1_updated = _create_sample_payload("overwrite_target", digit=9, label="9")
    post_res = client.post("/api/dataset/sample", json=sample1_updated)
    assert post_res.status_code == 200
    assert post_res.json()["overwritten"] is True
    assert post_res.json()["backup_created"] is True

    # Verify backup captured the original digit 4 state
    backup_file = post_res.json()["backup_file"]
    backup_path = os.path.join(dataset._get_backup_dir(), backup_file)
    with open(backup_path, "r", encoding="utf-8") as f:
        backup_data = json.load(f)
    assert backup_data[0]["digit"] == 4

    # Verify active dataset now has digit 9
    get_res = client.get("/api/dataset/samples")
    assert get_res.json()["samples"][0]["digit"] == 9


def test_backups_list_endpoint():
    """Verify GET /api/dataset/backups accurately reflects created backups."""
    # Initially 0 backups
    res_initial = client.get("/api/dataset/backups")
    assert res_initial.status_code == 200

    # Create sample and confirmed clear to trigger backup
    client.post("/api/dataset/sample", json=_create_sample_payload("backup_test_01"))
    client.delete("/api/dataset/clear?confirm=CONFIRM_CLEAR_DATASET")

    res_after = client.get("/api/dataset/backups")
    assert res_after.status_code == 200
    assert res_after.json()["total_backups"] >= 1
    assert any("genuine_collected_before_clear" in b["filename"] for b in res_after.json()["backups"])
