from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["Health"])


class HealthResponse(BaseModel):
    status: str
    application: str
    message: str


@router.get("/health", response_model=HealthResponse)
def get_health() -> HealthResponse:
    """Return application health status to verify backend connectivity."""
    return HealthResponse(
        status="ok",
        application="AeroSolve",
        message="Backend is running",
    )
