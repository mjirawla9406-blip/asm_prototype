"""
API integration test for BIMSu endpoints.
"""
import os
import time
import requests
import tempfile
import numpy as np

BASE_URL = "http://localhost:8000"
API_KEY = "asm-dev-key-2026"
HEADERS = {"X-API-Key": API_KEY}

def generate_dummy_xyz(path):
    # Same as previous synthetic data
    np.random.seed(42)
    all_points = []
    # Set 1
    for z_val in [3.0, 5.0, 7.0]:
        n = 400
        xy = np.random.rand(n, 2) * 10
        z = np.full((n, 1), z_val) + np.random.normal(0, 0.02, (n, 1))
        all_points.append(np.hstack([xy, z]))
    # Set 2
    for y_val in [2.0, 5.0, 8.0]:
        n = 300
        xz = np.random.rand(n, 2) * 10
        y = np.full((n, 1), y_val) + np.random.normal(0, 0.02, (n, 1))
        all_points.append(np.column_stack([xz[:, 0], y.flatten(), xz[:, 1]]))
    # Set 3
    for x_val in [2.0, 5.0, 8.0]:
        n = 250
        yz = np.random.rand(n, 2) * 10
        x = np.full((n, 1), x_val) + np.random.normal(0, 0.02, (n, 1))
        all_points.append(np.column_stack([x.flatten(), yz[:, 0], yz[:, 1]]))
    # Noise
    noise = np.random.rand(300, 3) * 10
    all_points.append(noise)
    points = np.vstack(all_points)
    np.savetxt(path, points, delimiter=' ')

def run_tests():
    tmp_xyz = os.path.join(tempfile.gettempdir(), 'test_dummy.xyz')
    generate_dummy_xyz(tmp_xyz)
    
    print("1. Testing Authentication (no API key)...")
    r0 = requests.get(f"{BASE_URL}/scan/test-001/status")
    assert r0.status_code == 401, f"Expected 401, got {r0.status_code}"
    print("   -> 401 Unauthorized confirmed.")

    print("\n2. Testing /api/analyse (synch upload)...")
    scan_id = "test-001"
    site_id = "HZL-Zawar"
    with open(tmp_xyz, 'rb') as f:
        files = {'file': ('test_dummy.xyz', f, 'text/plain')}
        params = {'scan_id': scan_id, 'site_id': site_id}
        r1 = requests.post(f"{BASE_URL}/api/analyse", params=params, files=files, headers=HEADERS)
        
        if r1.status_code != 200:
            print("   -> ERROR:", r1.text)
            
        assert r1.status_code == 200, f"Expected 200, got {r1.status_code}"
        data = r1.json()
        assert data['scan_id'] == scan_id
        assert data['schema_version'] == '1.1'
        assert 'planes' in data
        assert 'joint_sets' in data
        assert 'stereonet_b64' in data
        assert 'classified_las_url' in data
        assert 'bolt_count' in data
        assert 'bolt_density_per_m2' in data
        assert 'bolt_classified_las_url' in data
        print("   -> Success. Schema 1.1 matches ASMResponse.")

    print("\n3. Testing exports")
    r2 = requests.get(f"{BASE_URL}/export/dips/{scan_id}", headers=HEADERS)
    assert r2.status_code == 200, f"Expected 200, got {r2.status_code}"
    print("   -> Dips CSV File downloaded.")
    
    r2b = requests.get(f"{BASE_URL}/export/bolt_las/test_fake_id", headers=HEADERS)
    assert r2b.status_code == 404, f"Expected 404, got {r2b.status_code}"
    print("   -> Bolt LAS 404 handled gracefully")
    csv_lines = r2.text.strip().split('\n')
    print("      " + csv_lines[0])
    assert csv_lines[0].strip() == "Dip,DipDirection,Weight,Comment", "CSV Header mismatch"
    
    print("\n4. Testing /webhook/scan-complete...")
    scan_id_web = "test-web-001"
    webhook_data = {
        "scan_id": scan_id_web,
        "site_id": site_id,
        "file_path": tmp_xyz,
        "triggered_by": "BIMSu",
        "timestamp": "2026-03-30T10:00:00Z"
    }
    r3 = requests.post(f"{BASE_URL}/webhook/scan-complete", json=webhook_data, headers=HEADERS)
    assert r3.status_code == 202, f"Expected 202, got {r3.status_code}"
    print("   -> 202 Accepted. Background processing started.")
    
    print("\n5. Polling GET /scan/{scan_id}/status...")
    for _ in range(30):
        r4 = requests.get(f"{BASE_URL}/scan/{scan_id_web}/status", headers=HEADERS)
        assert r4.status_code == 200
        status_data = r4.json()
        print(f"   -> Status: {status_data['status']}")
        if status_data['status'] == 'complete':
            break
        time.sleep(2)
    assert status_data['status'] == 'complete', "Timeout waiting for background task"
    print("   -> Background processing complete.")
    
    print("\nALL tests passed successfully!")

if __name__ == '__main__':
    run_tests()
