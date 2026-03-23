"""
Automated Structural Mapping — FastAPI Backend
Main application entry point.
"""
import logging
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Automated Structural Mapping API",
    description=(
        "AI-powered structural mapping of underground mine point cloud data. "
        "Detects discontinuity planes, classifies them into structural sets, "
        "and generates mining intelligence insights."
    ),
    version="1.0.0",
)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
from routers.scan_routes import router as scan_router
from routers.analysis_routes import router as analysis_router

app.include_router(scan_router)
app.include_router(analysis_router)

# Ensure data directories exist
DATA_DIR = Path("data")
(DATA_DIR / "scans").mkdir(parents=True, exist_ok=True)
(DATA_DIR / "metadata").mkdir(parents=True, exist_ok=True)
(DATA_DIR / "results").mkdir(parents=True, exist_ok=True)


@app.get("/")
async def root():
    return {
        "service": "Automated Structural Mapping API",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "scans": "/api/scans",
            "analysis": "/api/analysis",
            "docs": "/docs",
        }
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
