"""
Pydantic models for the Automated Structural Mapping module.
Defines request/response schemas for all API endpoints.
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum
from datetime import datetime
import uuid


class ScanStatus(str, Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ScanQuality(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


# ----- Scan Models -----

class ScanMetadata(BaseModel):
    scan_id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    scan_name: str
    mine_id: str = "MINE-001"
    upload_date: str = Field(default_factory=lambda: datetime.now().isoformat())
    file_name: str = ""
    file_size: float = 0.0  # MB
    num_points: int = 0
    quality: float = 0.0  # percentage
    accuracy: float = 0.0  # percentage
    status: ScanStatus = ScanStatus.UPLOADED
    bounds: Optional[Dict[str, float]] = None


class ScanUploadResponse(BaseModel):
    scan_id: str
    status: str
    message: str


class ScanListResponse(BaseModel):
    scans: List[ScanMetadata]
    total: int


# ----- Analysis Models -----

class PlaneData(BaseModel):
    id: int
    set_id: int
    dip: float
    dip_direction: float
    strike: float
    normal: List[float]
    centroid: List[float]
    area: float
    num_points: int
    confidence: float
    color: str


class DiscontinuitySet(BaseModel):
    set_id: int
    name: str
    color: str
    num_planes: int
    mean_dip: float
    mean_dip_direction: float
    mean_strike: float
    std_dip: float
    std_dip_direction: float
    total_points: int


class StructuralInsight(BaseModel):
    category: str  # "risk", "optimization", "safety"
    severity: str  # "high", "medium", "low"
    title: str
    description: str
    recommendation: str
    related_sets: List[int]


class AnalysisRequest(BaseModel):
    scan_id: str
    max_planes: int = 30
    voxel_size: float = 0.1
    ransac_threshold: float = 0.05
    dbscan_eps: float = 0.15
    dbscan_min_samples: int = 2



class PointCloudData(BaseModel):
    """Downsampled point cloud for frontend rendering."""
    positions: List[List[float]]  # [[x,y,z], ...]
    colors: List[List[float]]  # [[r,g,b], ...]
    set_colors: Optional[List[List[float]]] = None  # [[r,g,b], ...] for structural sets
    normals: Optional[List[List[float]]] = None
    num_points: int = 0
    scale: float = 1.0
    centroid: List[float] = [0, 0, 0]


class AnalysisResult(BaseModel):
    scan_id: str
    status: str
    num_planes: int = 0
    num_sets: int = 0
    planes: List[PlaneData] = []
    sets: List[DiscontinuitySet] = []
    insights: List[StructuralInsight] = []
    point_cloud_data: Optional[PointCloudData] = None
    processing_time: float = 0.0
