/**
 * API Client for the Automated Structural Mapping backend.
 * Supports both the original scan/analysis routes and the BIMSu
 * integration contract (ASMResponse schema).
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

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

// ------------------------------------------------------------------ //
// BIMSu integration endpoints (ASMResponse schema)
// ------------------------------------------------------------------ //

/**
 * Upload a .las file and run the full ASM pipeline synchronously.
 * Returns an ASMResponse object on success.
 */
export async function analyseScan(file, scanId, siteId, onProgress) {
  const formData = new FormData();
  formData.append('file', file);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/analyse?scan_id=${encodeURIComponent(scanId)}&site_id=${encodeURIComponent(siteId)}`);
    xhr.setRequestHeader('X-API-Key', API_KEY);
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject({ error: data.detail || `HTTP ${xhr.status}` });
      } catch { reject({ error: 'Invalid response' }); }
    };
    xhr.onerror = () => reject({ error: 'Network error' });
    xhr.send(formData);
  });
}

/**
 * Poll the BIMSu scan status endpoint.
 */
export async function getScanStatus(scanId) {
  const res = await fetch(`${API_BASE}/scan/${scanId}/status`, {
    headers: { 'X-API-Key': API_KEY },
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  return res.json();
}

/**
 * Continuously poll scan status until complete / failed.
 * Returns a cancel function.
 */
export function pollScanStatus(scanId, onUpdate, intervalMs = 2000) {
  let active = true;
  const run = async () => {
    while (active) {
      const status = await getScanStatus(scanId).catch(e => ({ error: String(e) }));
      if (onUpdate) onUpdate(status);
      if (status.status === 'complete' || status.status === 'failed' || status.error) break;
      await new Promise(r => setTimeout(r, intervalMs));
    }
  };
  run();
  return () => { active = false; };
}

// ------------------------------------------------------------------ //
// Legacy endpoints (kept for backward compat with ScanLibrary)
// ------------------------------------------------------------------ //

export async function startAnalysis(scanId, params = {}) {
    const res = await fetch(`${API_BASE}/api/analysis/structural-mapping`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY
        },
        body: JSON.stringify({
            scan_id: scanId,
            max_planes: params.max_planes || 30,
            voxel_size: params.voxel_size || 0.1,
            ransac_threshold: params.ransac_threshold || 0.05,
            dbscan_eps: params.dbscan_eps || 0.15,
            dbscan_min_samples: params.dbscan_min_samples || 2
        })
    });
    if (!res.ok) throw new Error('API failed to start analysis');
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

/**
 * Download the classified LAS file for a completed analysis.
 * Returns a Blob that the caller can turn into a download link.
 */
export async function downloadClassifiedLas(scanId) {
    const res = await fetch(`${API_BASE}/api/analysis/${scanId}/classified-las`);
    if (!res.ok) throw new Error('Classified LAS not available');
    return res.blob();
}

/**
 * Download the Dips/Unwedge CSV export for a completed analysis.
 */
export async function downloadDipsCsv(scanId) {
    const res = await fetch(`${API_BASE}/export/dips/${scanId}`, {
        headers: { 'X-API-Key': API_KEY },
    });
    if (!res.ok) throw new Error(`Dips CSV not available (HTTP ${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ASM_${scanId}_dips.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
}

/**
 * Get the stereonet as a downloadable PNG.
 */
export async function downloadStereonetPng(scanId) {
    const res = await fetch(`${API_BASE}/api/analysis/${scanId}/stereonet`);
    if (!res.ok) throw new Error('Stereonet not available');
    return res.blob();
}

export async function downloadReport(scanId) {
  const res = await fetch(`${API_BASE}/report/${scanId}/pdf`, {
    headers: { 'X-API-Key': API_KEY },
  });
  if (!res.ok) throw new Error(`Report not available (HTTP ${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ASM_${scanId}_report.pdf`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
}
