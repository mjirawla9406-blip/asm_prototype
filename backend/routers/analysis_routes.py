"""
Analysis Routes.
Handles structural mapping analysis pipeline execution and result retrieval.
"""
import json
import time
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, BackgroundTasks
from models.schemas import (
    AnalysisRequest, AnalysisResult, PlaneData,
    DiscontinuitySet, StructuralInsight, PointCloudData
)

import numpy as np

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/analysis", tags=["Analysis"])

# Data directories
DATA_DIR = Path("data")
SCANS_DIR = DATA_DIR / "scans"
METADATA_DIR = DATA_DIR / "metadata"
RESULTS_DIR = DATA_DIR / "results"

RESULTS_DIR.mkdir(parents=True, exist_ok=True)

# In-memory status tracker
analysis_status = {}


def _get_scan_file(scan_id: str) -> Optional[Path]:
    """Find the scan file for a given scan_id."""
    scan_dir = SCANS_DIR / scan_id
    if not scan_dir.exists():
        return None
    files = list(scan_dir.iterdir())
    return files[0] if files else None


def _update_scan_status(scan_id: str, status: str):
    """Update scan status in metadata file."""
    meta_path = METADATA_DIR / f"{scan_id}.json"
    if meta_path.exists():
        with open(meta_path, 'r') as f:
            data = json.load(f)
        data['status'] = status
        with open(meta_path, 'w') as f:
            json.dump(data, f, indent=2)


def run_structural_mapping(
    scan_id: str,
    scan_file: str,
    max_planes: int = 30,
    voxel_size: float = 0.1,
    ransac_threshold: float = 0.05,
    dbscan_eps: float = 0.15,
    dbscan_min_samples: int = 2
):
    """
    Execute the full structural mapping pipeline.
    This runs in a background task.
    """
    start_time = time.time()
    analysis_status[scan_id] = {"status": "processing", "progress": 0, "message": "Starting..."}

    try:
        # Step 1: Load point cloud
        analysis_status[scan_id] = {"status": "processing", "progress": 10, "message": "Loading point cloud..."}
        _update_scan_status(scan_id, "processing")

        from services.pointcloud_loader import PointCloudLoader
        points, meta = PointCloudLoader.load(scan_file)
        logger.info(f"Loaded {len(points)} points from {scan_file}")

        # Step 2: Preprocess
        analysis_status[scan_id] = {"status": "processing", "progress": 25, "message": "Preprocessing..."}

        from services.preprocessor import Preprocessor
        preprocessor = Preprocessor(voxel_size=voxel_size)
        points_clean = preprocessor.preprocess(points)
        logger.info(f"Preprocessed to {len(points_clean)} points")

        # Step 3: Detect planes
        analysis_status[scan_id] = {"status": "processing", "progress": 45, "message": "Detecting planes..."}

        from services.plane_detection import PlaneDetector
        detector = PlaneDetector(
            distance_threshold=ransac_threshold,
            min_inliers=max(20, len(points_clean) // 500)
        )
        planes = detector.detect_planes(points_clean, max_planes=max_planes)
        logger.info(f"Detected {len(planes)} planes")

        # Step 4: Calculate orientations
        analysis_status[scan_id] = {"status": "processing", "progress": 60, "message": "Computing orientations..."}

        from services.orientation_calculator import OrientationCalculator
        planes = OrientationCalculator.compute_all_orientations(planes)

        # Step 5: Cluster into discontinuity sets
        analysis_status[scan_id] = {"status": "processing", "progress": 75, "message": "Clustering sets..."}

        from services.set_clustering import SetClusterer
        clusterer = SetClusterer(eps=dbscan_eps, min_samples=dbscan_min_samples)
        labels, set_info = clusterer.cluster_planes(planes)

        # Assign set info to planes
        set_colors = {s['set_id']: s['color'] for s in set_info}
        for i, plane in enumerate(planes):
            plane['set_id'] = int(labels[i])
            plane['color'] = set_colors.get(int(labels[i]), '#888888')

        # Step 6: Generate insights
        analysis_status[scan_id] = {"status": "processing", "progress": 90, "message": "Generating insights..."}

        from services.insights_engine import InsightsEngine
        insights = InsightsEngine.generate_insights(planes, set_info)

        # Step 7: Prepare visualization data (downsampled for frontend)
        viz_max = 50000
        if len(points_clean) > viz_max:
            viz_indices = np.random.choice(len(points_clean), viz_max, replace=False)
            viz_indices.sort()
            viz_points = points_clean[viz_indices]
        else:
            viz_points = points_clean

        centroid = np.mean(viz_points, axis=0)
        viz_centered = viz_points - centroid
        max_extent = np.max(np.ptp(viz_centered, axis=0))
        scale = 10.0 / max(max_extent, 1e-6)
        viz_scaled = viz_centered * scale

        # Prepare per-point set coloring
        point_to_set = {}
        for p in planes:
            set_id = p.get('set_id', -1)
            if set_id != -1:
                color = p.get('color', '#888888')
                for idx in p['inlier_indices']:
                    point_to_set[idx] = color

        # Color the visualization points (height gradient for original, set colors for analyzed)
        # Use a neutral very light gray base for both modes
        viz_colors = [[0.95, 0.95, 0.95]] * len(viz_scaled)
        
        # Set colors (hex to RGB)
        viz_set_colors = []
        for idx in viz_indices:
            hex_color = point_to_set.get(idx, '#e0e0e0')
            # Manual hex to rgb conversion to avoid library dependencies
            h = hex_color.lstrip('#')
            rgb = [int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4)]
            viz_set_colors.append(rgb)

        # Prepare plane data for frontend — scale inlier points too
        plane_data_list = []
        for p in planes:
            # Scale plane centroids and inlier points for visualization
            c = (np.array(p['centroid']) - centroid) * scale
            # Subsample inlier points for rendering plane meshes
            inlier_pts = np.array(p['inlier_points'])
            if len(inlier_pts) > 500:
                sub_idx = np.random.choice(len(inlier_pts), 500, replace=False)
                inlier_pts = inlier_pts[sub_idx]
            inlier_scaled = (inlier_pts - centroid) * scale

            plane_data_list.append(PlaneData(
                id=p['id'],
                set_id=p.get('set_id', 0),
                dip=p.get('dip', 0),
                dip_direction=p.get('dip_direction', 0),
                strike=p.get('strike', 0),
                normal=p['normal'],
                centroid=c.round(4).tolist(),
                area=round(p.get('area', 0) * scale * scale, 2),
                num_points=p['num_points'],
                confidence=p['confidence'],
                color=p.get('color', '#888888'),
            ))

        set_data_list = [DiscontinuitySet(**s) for s in set_info]
        insight_data_list = [StructuralInsight(**ins) for ins in insights]

        processing_time = round(time.time() - start_time, 2)

        # Log data sizes for verification
        logger.info(f"Analysis result ready. Points: {len(viz_scaled)}, "
                    f"Set-colored points: {len(viz_set_colors)}, "
                    f"Planes: {len(plane_data_list)}, Sets: {len(set_data_list)}")
        
        # Step 8: Save results to disk
        result_dir = RESULTS_DIR / scan_id
        result_dir.mkdir(parents=True, exist_ok=True)
        result_path = result_dir / "analysis_result.json"
        # Construct final payload as a dictionary to ensure no keys are stripped by Pydantic model_dump
        payload = {
            "scan_id": scan_id,
            "status": "completed",
            "num_planes": len(planes),
            "num_sets": len(set_info),
            "planes": [p.model_dump() for p in plane_data_list],
            "sets": [s.model_dump() for s in set_data_list],
            "insights": [ins.model_dump() for ins in insight_data_list],
            "point_cloud_data": {
                "positions": viz_scaled.round(4).tolist(),
                "colors": viz_colors,
                "set_colors": viz_set_colors,
                "num_points": len(viz_scaled),
                "scale": float(scale),
                "centroid": [float(c) for c in centroid],
            },
            "processing_time": processing_time,
        }

        with open(result_path, 'w') as f:
            json.dump(payload, f, indent=2)
            
        logger.info(f"Analysis saved to {result_path}. Keys: {list(payload['point_cloud_data'].keys())}")

        analysis_status[scan_id] = {"status": "completed", "progress": 100, "message": "Analysis complete!"}
        _update_scan_status(scan_id, "completed")

        logger.info(f"Analysis complete for scan {scan_id} in {processing_time}s")

    except Exception as e:
        logger.error(f"Analysis failed for scan {scan_id}: {str(e)}", exc_info=True)
        analysis_status[scan_id] = {"status": "failed", "progress": 0, "message": str(e)}
        _update_scan_status(scan_id, "failed")


@router.post("/structural-mapping")
async def start_structural_mapping(
    request: AnalysisRequest,
    background_tasks: BackgroundTasks
):
    """
    Start structural mapping analysis for a scan.
    Runs processing in the background and returns immediately.
    """
    scan_file = _get_scan_file(request.scan_id)
    if not scan_file:
        raise HTTPException(status_code=404, detail=f"Scan {request.scan_id} not found")

    # Check if already processing
    if request.scan_id in analysis_status:
        status = analysis_status[request.scan_id]
        if status.get('status') == 'processing':
            return {"status": "already_processing", "scan_id": request.scan_id}

    # Start background processing
    background_tasks.add_task(
        run_structural_mapping,
        scan_id=request.scan_id,
        scan_file=str(scan_file),
        max_planes=request.max_planes,
        voxel_size=request.voxel_size,
        ransac_threshold=request.ransac_threshold,
        dbscan_eps=request.dbscan_eps,
        dbscan_min_samples=request.dbscan_min_samples,
    )

    analysis_status[request.scan_id] = {"status": "processing", "progress": 0, "message": "Queued..."}

    return {
        "status": "started",
        "scan_id": request.scan_id,
        "message": "Structural mapping analysis started"
    }


@router.get("/status/{scan_id}")
async def get_analysis_status(scan_id: str):
    """Get the current status of an analysis job."""
    if scan_id in analysis_status:
        return analysis_status[scan_id]

    # Check for saved results
    result_path = RESULTS_DIR / scan_id / "analysis_result.json"
    if result_path.exists():
        return {"status": "completed", "progress": 100, "message": "Analysis complete"}

    return {"status": "not_found", "progress": 0, "message": "No analysis found"}


@router.get("/{scan_id}", response_model=AnalysisResult)
async def get_analysis_result(scan_id: str):
    """Get the full analysis results for a scan."""
    result_path = RESULTS_DIR / scan_id / "analysis_result.json"

    if not result_path.exists():
        raise HTTPException(status_code=404, detail=f"No analysis results for scan {scan_id}")

    with open(result_path, 'r') as f:
        data = json.load(f)

    return AnalysisResult(**data)


@router.get("/{scan_id}/planes")
async def get_planes(scan_id: str):
    """Get just the detected planes for a scan."""
    result_path = RESULTS_DIR / scan_id / "analysis_result.json"
    if not result_path.exists():
        raise HTTPException(status_code=404, detail="No analysis results found")

    with open(result_path, 'r') as f:
        data = json.load(f)

    return {"planes": data.get("planes", []), "num_planes": data.get("num_planes", 0)}


@router.get("/{scan_id}/sets")
async def get_sets(scan_id: str):
    """Get discontinuity sets for a scan."""
    result_path = RESULTS_DIR / scan_id / "analysis_result.json"
    if not result_path.exists():
        raise HTTPException(status_code=404, detail="No analysis results found")

    with open(result_path, 'r') as f:
        data = json.load(f)

    return {"sets": data.get("sets", []), "num_sets": data.get("num_sets", 0)}


@router.get("/{scan_id}/insights")
async def get_insights(scan_id: str):
    """Get structural insights for a scan."""
    result_path = RESULTS_DIR / scan_id / "analysis_result.json"
    if not result_path.exists():
        raise HTTPException(status_code=404, detail="No analysis results found")

    with open(result_path, 'r') as f:
        data = json.load(f)

    return {"insights": data.get("insights", [])}
