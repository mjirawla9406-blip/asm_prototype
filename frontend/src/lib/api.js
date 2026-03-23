/**
 * API Client for the Automated Structural Mapping backend.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function uploadScan(file, scanName, mineId = 'MINE-001') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('scan_name', scanName);
    formData.append('mine_id', mineId);

    const res = await fetch(`${API_BASE}/api/scans/upload`, {
        method: 'POST',
        body: formData,
    });

    if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
    return res.json();
}

export async function listScans() {
    const res = await fetch(`${API_BASE}/api/scans/list`);
    if (!res.ok) throw new Error('Failed to fetch scans');
    return res.json();
}

export async function getScan(scanId) {
    const res = await fetch(`${API_BASE}/api/scans/${scanId}`);
    if (!res.ok) throw new Error('Failed to fetch scan');
    return res.json();
}

export async function deleteScan(scanId) {
    const res = await fetch(`${API_BASE}/api/scans/${scanId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete scan');
    return res.json();
}

export async function getPointCloudData(scanId, maxPoints = 50000) {
    const res = await fetch(`${API_BASE}/api/scans/${scanId}/pointcloud?max_points=${maxPoints}`);
    if (!res.ok) throw new Error('Failed to fetch point cloud data');
    return res.json();
}

export async function startAnalysis(scanId, params = {}) {
    const body = {
        scan_id: scanId,
        max_planes: params.maxPlanes || 30,
        voxel_size: params.voxelSize || 0.1,
        ransac_threshold: params.ransacThreshold || 0.05,
        dbscan_eps: params.dbscanEps || 0.15,
        dbscan_min_samples: params.dbscanMinSamples || 2,
    };

    const res = await fetch(`${API_BASE}/api/analysis/structural-mapping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error('Failed to start analysis');
    return res.json();
}

export async function getAnalysisStatus(scanId) {
    const res = await fetch(`${API_BASE}/api/analysis/status/${scanId}`);
    if (!res.ok) throw new Error('Failed to get analysis status');
    return res.json();
}

export async function getAnalysisResult(scanId) {
    const res = await fetch(`${API_BASE}/api/analysis/${scanId}`);
    if (!res.ok) throw new Error('Failed to get analysis results');
    return res.json();
}

export async function getPlanes(scanId) {
    const res = await fetch(`${API_BASE}/api/analysis/${scanId}/planes`);
    if (!res.ok) throw new Error('Failed to get planes');
    return res.json();
}

export async function getSets(scanId) {
    const res = await fetch(`${API_BASE}/api/analysis/${scanId}/sets`);
    if (!res.ok) throw new Error('Failed to get sets');
    return res.json();
}

export async function getInsights(scanId) {
    const res = await fetch(`${API_BASE}/api/analysis/${scanId}/insights`);
    if (!res.ok) throw new Error('Failed to get insights');
    return res.json();
}
export async function importLocalScan(filePath, scanName, mineId = 'MINE-001') {
    const res = await fetch(`${API_BASE}/api/scans/import-local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            file_path: filePath,
            scan_name: scanName,
            mine_id: mineId
        }),
    });

    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Local import failed');
    }
    return res.json();
}
