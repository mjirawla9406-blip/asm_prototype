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
    fisher_k: Optional[float] = None
    fisher_k_label: Optional[str] = None


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
    stereonet_b64: Optional[str] = None
    classified_las_path: Optional[str] = None


# =====================================================================
# BIMSu Integration Contract — v1.0
# These models define the external API contract for BIMSu.
# Field names and types must NOT change once deployed.
# =====================================================================

class PlaneRecord(BaseModel):
    """Single detected discontinuity plane — BIMSu contract."""
    plane_id: int = Field(description="Unique plane identifier within this scan")
    dip: float = Field(description="Dip angle in degrees (0–90)")
    dip_direction: float = Field(description="Dip direction azimuth in degrees (0–360)")
    joint_set_id: int = Field(description="Assigned joint set ID (-1 = unclassified)")
    inlier_count: int = Field(description="Number of inlier points belonging to this plane")
    area_m2: float = Field(description="Convex hull area of the plane in square metres")


class JointSetRecord(BaseModel):
    """Clustered discontinuity set — BIMSu contract."""
    set_id: int = Field(description="Joint set identifier (0-based)")
    plane_count: int = Field(description="Number of planes in this set")
    mean_dip: float = Field(description="Mean dip angle in degrees (0–90)")
    mean_dip_direction: float = Field(description="Mean dip direction azimuth in degrees (0–360)")
    fisher_k: Optional[float] = Field(None, description="Fisher concentration parameter K-value, null if N < 3")
    fisher_k_label: Optional[str] = Field(None, description="Qualitative K label: dispersed | moderate | strong | null")
    persistence_m: float = Field(description="Mean plane dimension in metres (derived from sqrt of mean area)")
    spatial_density: float = Field(description="Planes per cubic metre within the scan bounding volume")


class ASMResponse(BaseModel):
    """Top-level API response — BIMSu contract v1.1."""
    schema_version: str = Field("1.1", description="Schema version for BIMSu compatibility")
    scan_id: str = Field(description="UUID of the scan, passed in by caller")
    site_id: str = Field(description="Site identifier, passed in by caller")
    processed_at: datetime = Field(description="Processing completion timestamp in UTC ISO-8601")
    input_file: str = Field(description="Original input filename")
    point_count_raw: int = Field(description="Number of points in the raw input file")
    point_count_processed: int = Field(description="Number of points after preprocessing")
    planes_detected: int = Field(description="Total number of planes detected by RANSAC")
    
    # DeepBolt metadata
    bolt_count: Optional[int] = Field(None, description="Number of individual rock bolt instances detected. None if DeepBolt did not run.")
    bolt_density_per_m2: Optional[float] = Field(None, description="Bolt instances per square metre of stope wall surface. None if DeepBolt did not run.")
    bolt_classified_las_url: Optional[str] = Field(None, description="Relative URL to the bolt-classified .las export. None if DeepBolt did not run.")
    
    joint_sets: List[JointSetRecord] = Field(description="List of clustered joint sets with statistics")
    planes: List[PlaneRecord] = Field(description="List of all detected discontinuity planes")
    stereonet_b64: str = Field(description="Base64-encoded PNG of the Schmidt equal-area stereonet")
    classified_las_url: Optional[str] = Field(None, description="Presigned URL or local path to the classified .las file")
    dips_export_url: Optional[str] = Field(None, description="URL to download the Dips/Unwedge CSV export")
    warnings: List[str] = Field(default_factory=list, description="Non-fatal issues encountered during processing")
    error: Optional[str] = Field(None, description="Error message if processing failed, null on success")


class ScanCompleteWebhook(BaseModel):
    """Webhook request body for automated scan processing trigger."""
    scan_id: str = Field(description="UUID of the scan")
    site_id: str = Field(description="Site identifier (e.g. HZL-Zawar)")
    file_path: str = Field(description="Absolute path to .las/.laz file on shared storage")
    triggered_by: str = Field(description="Source of the trigger: BIMSu, DroneOS, manual")
    timestamp: datetime = Field(description="Timestamp of the triggering event")


class ScanStatusResponse(BaseModel):
    """Status check response for a processing job."""
    scan_id: str = Field(description="UUID of the scan")
    status: str = Field(description="Processing status: processing | complete | failed")
    result: Optional[ASMResponse] = Field(None, description="Full ASMResponse when complete, null otherwise")
