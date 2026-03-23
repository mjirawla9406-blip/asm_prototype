
import sys
import os
from pathlib import Path

# Add backend to path
sys.path.append(os.getcwd())

from models.schemas import AnalysisResult, PointCloudData, PlaneData, DiscontinuitySet

def test_serialization():
    pc = PointCloudData(
        positions=[[0,0,0], [1,1,1]],
        colors=[[1,0,0], [0,1,0]],
        set_colors=[[0.5, 0.5, 0.5], [1, 1, 1]],
        num_points=2
    )
    
    result = AnalysisResult(
        scan_id="test-123",
        status="completed",
        point_cloud_data=pc
    )
    
    # Dump
    dumped = result.model_dump()
    print("Keys in point_cloud_data:", dumped['point_cloud_data'].keys())
    
    if 'set_colors' in dumped['point_cloud_data']:
        print("SUCCESS: set_colors found in dumped dict")
    else:
        print("FAILURE: set_colors NOT found in dumped dict")

if __name__ == "__main__":
    test_serialization()
