"""
Scan Management Routes.
Handles upload, list, get, and delete operations for point cloud scans.
"""
import os
import json
import shutil
import uuid
from pathlib import Path
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse, FileResponse

from models.schemas import ScanMetadata, ScanUploadResponse, ScanListResponse

router = APIRouter(prefix="/api/scans", tags=["Scans"])

# Data directories
DATA_DIR = Path("data")
SCANS_DIR = DATA_DIR / "scans"
METADATA_DIR = DATA_DIR / "metadata"

# Ensure directories exist
SCANS_DIR.mkdir(parents=True, exist_ok=True)
METADATA_DIR.mkdir(parents=True, exist_ok=True)


def _load_all_metadata() -> list[ScanMetadata]:
    """Load all scan metadata from disk."""
    scans = []
    for f in METADATA_DIR.glob("*.json"):
        try:
            with open(f, 'r') as fp:
                data = json.load(fp)
                scans.append(ScanMetadata(**data))
        except Exception:
            continue
    # Sort by upload date descending
    scans.sort(key=lambda s: s.upload_date, reverse=True)
    return scans


def _save_metadata(scan: ScanMetadata):
    """Save scan metadata to disk."""
    meta_path = METADATA_DIR / f"{scan.scan_id}.json"
    with open(meta_path, 'w') as f:
        json.dump(scan.model_dump(), f, indent=2, default=str)


def _get_metadata(scan_id: str) -> Optional[ScanMetadata]:
    """Load metadata for a specific scan."""
    meta_path = METADATA_DIR / f"{scan_id}.json"
    if not meta_path.exists():
        return None
    with open(meta_path, 'r') as f:
        data = json.load(f)
    return ScanMetadata(**data)


@router.post("/upload", response_model=ScanUploadResponse)
async def upload_scan(
    file: UploadFile = File(...),
    scan_name: str = Form(...),
    mine_id: str = Form("MINE-001"),
):
    """
    Upload a new point cloud scan file.
    Supports: LAS, LAZ, PLY, XYZ formats.
    """
    # Validate file extension
    ext = Path(file.filename).suffix.lower()
    allowed = {'.las', '.laz', '.ply', '.xyz', '.txt'}
    if ext not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format: {ext}. Allowed: {allowed}"
        )

    # Generate scan ID
    scan_id = str(uuid.uuid4())[:8]

    # Save file to disk
    scan_dir = SCANS_DIR / scan_id
    scan_dir.mkdir(parents=True, exist_ok=True)
    file_path = scan_dir / file.filename

    try:
        with open(file_path, 'wb') as f:
            while True:
                chunk = await file.read(2 * 1024 * 1024)  # 2MB chunks
                if not chunk:
                    break
                f.write(chunk)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    file_size_mb = os.path.getsize(file_path) / (1024 * 1024)

    # Quick point count estimate
    num_points = 0
    try:
        from services.pointcloud_loader import PointCloudLoader
        points, meta = PointCloudLoader.load(str(file_path))
        num_points = len(points)
        quality_info = PointCloudLoader.validate_points(points)
        quality = quality_info.get('quality', 95.0)
        accuracy = min(99.5, quality + 2.0)
        bounds = quality_info.get('bounds', None)
    except Exception:
        quality = 95.0
        accuracy = 97.0
        bounds = None

    # Create metadata
    scan_meta = ScanMetadata(
        scan_id=scan_id,
        scan_name=scan_name,
        mine_id=mine_id,
        upload_date=datetime.now().isoformat(),
        file_name=file.filename,
        file_size=round(file_size_mb, 2),
        num_points=num_points,
        quality=quality,
        accuracy=accuracy,
        status="uploaded",
    )

    _save_metadata(scan_meta)

    return ScanUploadResponse(
        scan_id=scan_id,
        status="uploaded",
        message=f"Scan '{scan_name}' uploaded successfully ({num_points:,} points, {file_size_mb:.1f} MB)"
    )


@router.get("/list", response_model=ScanListResponse)
async def list_scans():
    """List all uploaded scans."""
    scans = _load_all_metadata()
    return ScanListResponse(scans=scans, total=len(scans))


@router.get("/{scan_id}")
async def get_scan(scan_id: str):
    """Get metadata for a specific scan."""
    scan = _get_metadata(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail=f"Scan {scan_id} not found")
    return scan


@router.delete("/{scan_id}")
async def delete_scan(scan_id: str):
    """Delete a scan and its associated data."""
    meta_path = METADATA_DIR / f"{scan_id}.json"
    scan_dir = SCANS_DIR / scan_id
    results_dir = DATA_DIR / "results" / scan_id

    if not meta_path.exists():
        raise HTTPException(status_code=404, detail=f"Scan {scan_id} not found")

    # Remove files safely (ignore Windows permission locks)
    try:
        if scan_dir.exists():
            shutil.rmtree(scan_dir, ignore_errors=True)
        if results_dir.exists():
            shutil.rmtree(results_dir, ignore_errors=True)
        if meta_path.exists():
            meta_path.unlink(missing_ok=True)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Error while deleting scan {scan_id}: {e}")

    return {"status": "deleted", "scan_id": scan_id}


@router.post("/import-local")
async def import_local_scan(body: dict):
    """
    Import a scan directly from a local file path on the server.
    This avoids browser upload limits for large LAS files (100MB+).
    Body: {"file_path": "C:\\path\\to\\file.las", "scan_name": "My Scan"}
    """
    file_path = body.get("file_path", "")
    scan_name = body.get("scan_name", "")
    mine_id = body.get("mine_id", "MINE-001")

    if not file_path or not scan_name:
        raise HTTPException(status_code=400, detail="file_path and scan_name are required")

    source = Path(file_path)
    if not source.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

    ext = source.suffix.lower()
    allowed = {'.las', '.laz', '.ply', '.xyz', '.txt'}
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}")

    scan_id = str(uuid.uuid4())[:8]
    scan_dir = SCANS_DIR / scan_id
    scan_dir.mkdir(parents=True, exist_ok=True)
    dest = scan_dir / source.name

    # Copy file (not move, to keep original)
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Importing scan from {source} -> {dest}")
    shutil.copy2(str(source), str(dest))

    file_size_mb = os.path.getsize(dest) / (1024 * 1024)

    # Load and validate
    num_points = 0
    quality = 95.0
    accuracy = 97.0
    try:
        from services.pointcloud_loader import PointCloudLoader
        points, meta = PointCloudLoader.load(str(dest))
        num_points = len(points)
        quality_info = PointCloudLoader.validate_points(points)
        quality = quality_info.get('quality', 95.0)
        accuracy = min(99.5, quality + 2.0)
    except Exception as e:
        logger.warning(f"Could not validate imported file: {e}")

    scan_meta = ScanMetadata(
        scan_id=scan_id,
        scan_name=scan_name,
        mine_id=mine_id,
        upload_date=datetime.now().isoformat(),
        file_name=source.name,
        file_size=round(file_size_mb, 2),
        num_points=num_points,
        quality=quality,
        accuracy=accuracy,
        status="uploaded",
    )

    _save_metadata(scan_meta)

    return {
        "scan_id": scan_id,
        "status": "uploaded",
        "message": f"Imported '{scan_name}' from {source.name} ({num_points:,} points, {file_size_mb:.1f} MB)"
    }


@router.get("/{scan_id}/pointcloud")
async def get_pointcloud_data(scan_id: str, max_points: int = 50000):
    """
    Get downsampled point cloud data for 3D visualization.
    Returns positions and colors arrays for Three.js rendering.
    """
    scan = _get_metadata(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail=f"Scan {scan_id} not found")

    scan_dir = SCANS_DIR / scan_id
    if not scan_dir.exists():
        raise HTTPException(status_code=404, detail="Scan files not found")

    # Find scan file
    scan_files = list(scan_dir.iterdir())
    if not scan_files:
        raise HTTPException(status_code=404, detail="No scan file found")

    file_path = scan_files[0]

    try:
        from services.pointcloud_loader import PointCloudLoader
        points, meta = PointCloudLoader.load(str(file_path))

        # Extract real colors from metadata (if LAS file had RGB)
        real_colors = meta.get('colors', None)

        # Downsample for visualization
        indices = None
        if len(points) > max_points:
            indices = np.random.choice(len(points), max_points, replace=False)
            indices.sort()
            points = points[indices]
            if real_colors is not None:
                real_colors = real_colors[indices]

        # Normalize to center
        centroid = np.mean(points, axis=0)
        points_centered = points - centroid

        # Scale to reasonable viewer size
        max_extent = np.max(np.ptp(points_centered, axis=0))
        if max_extent > 0:
            scale = 10.0 / max_extent
        else:
            scale = 1.0
        points_scaled = points_centered * scale

        # Use real RGB colors if available, else fall back to height gradient
        if real_colors is not None and len(real_colors) == len(points_scaled):
            colors = np.clip(real_colors, 0.0, 1.0).round(3).tolist()
            has_real_colors = True
        else:
            z_vals = points_scaled[:, 2]
            z_min, z_max = z_vals.min(), z_vals.max()
            z_range = max(z_max - z_min, 1e-6)
            z_norm = (z_vals - z_min) / z_range

            colors = []
            for t in z_norm:
                r = 0.8 + 0.2 * t
                g = 0.3 + 0.3 * t
                b = 0.1 + 0.1 * (1 - t)
                colors.append([round(r, 3), round(g, 3), round(b, 3)])
            has_real_colors = False

        return {
            "positions": points_scaled.round(4).tolist(),
            "colors": colors,
            "num_points": len(points_scaled),
            "centroid": centroid.tolist(),
            "scale": scale,
            "bounds": np.ptp(points, axis=0).tolist(),
            "has_real_colors": has_real_colors,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process point cloud: {str(e)}")



def _ensure_potree_compatible(file_path: Path) -> Path:
    if file_path.suffix.lower() not in ['.las', '.laz']:
        return file_path
        
    compatible_path = file_path.parent / f"potree_compat_{file_path.name}"
    if compatible_path.exists():
        return compatible_path
        
    try:
        import laspy
        
        # Read the file header first to check if conversion is needed
        with laspy.open(file_path) as f:
            if f.header.version.major == 1 and f.header.version.minor <= 2 and f.header.point_format.id <= 3:
                return file_path
        
        # Needs conversion
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Converting {file_path.name} to LAS 1.2 Format 3 for Potree compatibility")
        
        las = laspy.read(file_path)
        
        # Determine the target format. Format 3 has RGB and GPS time.
        has_color = hasattr(las, 'red') and hasattr(las, 'green') and hasattr(las, 'blue')
        target_format = 3 if has_color else 0
        
        # Create a new LAS file with version 1.2
        new_header = laspy.LasHeader(point_format=target_format, version="1.2")
        new_header.scales = las.header.scales
        new_header.offsets = las.header.offsets
        
        new_las = laspy.LasData(new_header)
        
        # Copy standard dimensions
        new_las.x = las.x
        new_las.y = las.y
        new_las.z = las.z
        
        if hasattr(las, 'intensity') and hasattr(new_las, 'intensity'):
            new_las.intensity = las.intensity
            
        if hasattr(las, 'classification') and hasattr(new_las, 'classification'):
            new_las.classification = las.classification
            
        if target_format == 3 and hasattr(las, 'red') and hasattr(las, 'green') and hasattr(las, 'blue'):
            new_las.red = las.red
            new_las.green = las.green
            new_las.blue = las.blue
            
        new_las.write(compatible_path)
        return compatible_path
        
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Failed to convert LAS for Potree: {e}")
        return file_path


@router.get("/{scan_id}/file")
async def get_scan_file(scan_id: str):
    scan_folder = SCANS_DIR / scan_id
    
    if not scan_folder.exists():
        raise HTTPException(status_code=404, detail=f"Scan folder {scan_id} not found")

    # Find whatever file is in that folder (ignore our generated compat files for the search)
    for fname in os.listdir(scan_folder):
        if fname.lower().endswith(('.las', '.laz', '.ply')) and not fname.startswith('potree_compat_'):
            file_path = scan_folder / fname
            
            # Ensure compatibility for Potree
            served_path = _ensure_potree_compatible(file_path)
            
            return FileResponse(
                path=served_path,
                media_type="application/octet-stream",
                filename=fname, # still send original filename
                headers={"Accept-Ranges": "bytes"}  # needed for large file streaming
            )
    
    return {"error": "No scan file found"}
