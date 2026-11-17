"""Integration tests for AeroSolve FastAPI backend."""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_root_endpoint():
    """Test the root endpoint returns application info."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["application"] == "AeroSolve"
    assert "health_check" in data


def test_health_endpoint():
    """Test the health check endpoint returns 200 and expected payload."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data == {
        "status": "ok",
        "application": "AeroSolve",
        "message": "Backend is running",
    }


def test_cors_headers():
    """Test CORS preflight or origin header handling."""
    response = client.get(
        "/api/health",
        headers={"Origin": "http://localhost:5173"},
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"
