import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.routes.health import router as health_router
from app.routes.dataset import router as dataset_router

# Retrieve allowed CORS origins from environment, with sane defaults for local development
cors_origins_env = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
origins = [origin.strip() for origin in cors_origins_env.split(",") if origin.strip()]

app = FastAPI(
    title="AeroSolve API",
    description="Backend API for AeroSolve: AI-powered air-writing mathematics learning application",
    version="0.1.0",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include route handlers
app.include_router(health_router)
app.include_router(dataset_router)


@app.get("/")
def root():
    """Root endpoint confirming API availability."""
    return {
        "status": "ok",
        "application": "AeroSolve",
        "version": "0.1.0",
        "docs_url": "/docs",
        "health_check": "/api/health",
    }


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Fallback exception handler for unhandled server errors."""
    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "message": "An internal server error occurred.",
            "detail": str(exc),
        },
    )


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app.main:app", host=host, port=port, reload=True)
