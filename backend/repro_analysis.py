
import sys
import os
import json
import numpy as np
from pathlib import Path

# Add backend to path
sys.path.append(os.getcwd())

from models.schemas import AnalysisResult, PointCloudData, PlaneData, DiscontinuitySet, StructuralInsight, AnalysisRequest
from services.pointcloud_loader import PointCloudLoader
from services.plane_detection import PlaneDetector

def run_test_analysis(scan_id):
    print(f"Testing analysis for {scan_id}")
    
    # Mock some data if needed, or load real one
    scans_dir = Path("data/scans") / scan_id
    if not scans_dir.exists():
        print(f"Scan {scan_id} not found on disk")
        return
        
    scan_file = list(scans_dir.iterdir())[0]
    points, meta = PointCloudLoader.load(str(scan_file))
    print(f"Loaded {len(points)} points")
    
    detector = PlaneDetector(distance_threshold=0.05, min_inliers=50)
    planes = detector.detect_planes(points, max_planes=5) # few planes for speed
    print(f"Detected {len(planes)} planes")
    
    # ... logic for point_to_set ...
    point_to_set = {}
    for p in planes:
        color = "#FF4444"
        for idx in p['inlier_indices']:
            point_to_set[idx] = color
            
    viz_indices = np.random.choice(len(points), min(len(points), 1000), replace=False)
    viz_set_colors = []
    for idx in viz_indices:
        hex_color = point_to_set.get(idx, '#e0e0e0')
        h = hex_color.lstrip('#')
        rgb = [int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4)]
        viz_set_colors.append(rgb)
        
    print(f"Generated {len(viz_set_colors)} set colors")
    
    pc = PointCloudData(
        positions=points[viz_indices].tolist(),
        colors=[[1,1,1]] * len(viz_indices),
        set_colors=viz_set_colors,
        num_points=len(viz_indices)
    )
    
    result = AnalysisResult(
        scan_id=scan_id,
        status="completed",
        point_cloud_data=pc
    )
    
    # Save
    out_path = Path("/tmp/test_result_out.json")
    with open(out_path, 'w') as f:
        json.dump(result.model_dump(), f, indent=2)
        
    print(f"Saved to {out_path}")
    
    # Verify
    with open(out_path, 'r') as f:
        data = json.load(f)
        if 'set_colors' in data['point_cloud_data']:
            print("SUCCESS: set_colors found in JSON file")
        else:
            print("FAILURE: set_colors NOT found in JSON file")

if __name__ == "__main__":
    # Use scan_id from previous check if possible, or any existing one
    run_test_analysis("cee62e7b")
