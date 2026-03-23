'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Search, Upload, Trash2, Play, Clock,
    CheckCircle, AlertCircle, Loader2, Plus, ChevronDown
} from 'lucide-react';
import useStore from '@/store/useStore';
import {
    listScans, uploadScan, deleteScan,
    startAnalysis, getAnalysisStatus, getAnalysisResult,
    getPointCloudData
} from '@/lib/api';

export default function ScanLibrary() {
    const {
        scans, setScans, selectedScanId, setSelectedScanId,
        setScanLoading, setPointCloudData, setPointCloudLoading,
        setAnalysisResult, setAnalysisLoading, setAnalysisProgress,
        analysisLoading, analysisProgress, analysisMessage,
        triggerUpload, setTriggerUpload,
    } = useStore();

    const [searchQuery, setSearchQuery] = useState('');
    const [showUpload, setShowUpload] = useState(false);

    const [uploadName, setUploadName] = useState('');
    const [uploadFile, setUploadFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [error, setError] = useState('');
    const [backendConnected, setBackendConnected] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);

    // Load scans on mount
    useEffect(() => {
        fetchScans();
    }, []);

    const fetchScans = async () => {
        try {
            setScanLoading(true);
            const data = await listScans();
            setScans(data.scans || []);
            setBackendConnected(true);
        } catch (e) {
            console.error('Failed to fetch scans:', e);
            setBackendConnected(false);
            // Set demo scans for UI preview when backend is offline
            setScans(getDemoScans());
        } finally {
            setScanLoading(false);
            // Check again after 2 seconds if still empty
            if (scans.length === 0 && !backendConnected) {
                setTimeout(fetchScans, 2000);
            }
        }
    };

    const handleSelectScan = async (scanId) => {
        setSelectedScanId(scanId);
        setPointCloudLoading(true);
        const currentDensity = useStore.getState().pointDensity;
        try {
            const pcData = await getPointCloudData(scanId, currentDensity);
            setPointCloudData(pcData);
        } catch (e) {
            console.log('Using demo point cloud data');
            setPointCloudData(generateDemoPointCloud());
        } finally {
            setPointCloudLoading(false);
        }

        // Check for existing results or status
        try {
            const status = await getAnalysisStatus(scanId);
            if (status.status === 'completed') {
                const result = await getAnalysisResult(scanId);
                setAnalysisResult(result);
            } else if (status.status === 'processing') {
                // If it's already processing (e.g. from a previous session or auto-started), 
                // re-start the polling UI for this scan
                handleStartAnalysis(scanId);
            }
        } catch (e) {
            // No existing results or failed to get status
        }
    };

    const handleUpload = async () => {
        if (!uploadFile || !uploadName) return;
        setUploading(true);
        setUploadProgress(0);
        setError('');
        try {
            // Use XMLHttpRequest for upload progress tracking
            const formData = new FormData();
            formData.append('file', uploadFile);
            formData.append('scan_name', uploadName);
            formData.append('mine_id', 'MINE-001');

            const uploadResponse = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', 'http://localhost:8000/api/scans/upload');
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        setUploadProgress(Math.round((e.loaded / e.total) * 100));
                    }
                };
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve(JSON.parse(xhr.responseText));
                    } else {
                        reject(new Error(`Upload failed: HTTP ${xhr.status}`));
                    }
                };
                xhr.onerror = () => reject(new Error('Network error during upload'));
                xhr.send(formData);
            });

            setShowUpload(false);
            setUploadName('');
            setUploadFile(null);
            setUploadProgress(0);
            
            // Re-fetch scans to update list
            await fetchScans();
            
            // Auto-select and auto-analyze the newly uploaded scan
            if (uploadResponse && uploadResponse.scan_id) {
                handleSelectScan(uploadResponse.scan_id);
                handleStartAnalysis(uploadResponse.scan_id);
            }
            
        } catch (e) {
            setError('Upload failed: ' + e.message);
        } finally {
            setUploading(false);
        }
    };




    const handleDelete = async (scanId, e) => {
        e.stopPropagation();

        if (deleteConfirmId !== scanId) {
            setDeleteConfirmId(scanId);
            return;
        }

        setDeleteConfirmId(null);
        try {
            await deleteScan(scanId);
            if (selectedScanId === scanId) {
                setSelectedScanId(null);
                setPointCloudData(null);
                setAnalysisResult(null);
            }
            await fetchScans();
        } catch (e) {
            console.error('Delete failed:', e);
            alert('Failed to delete scan: ' + e.message);
        }
    };

    const handleStartAnalysis = async (scanId, e) => {
        if (e) e.stopPropagation();
        setAnalysisLoading(true);
        setAnalysisProgress(0, 'Starting analysis...');
        try {
            await startAnalysis(scanId);

            // Poll for status
            const pollInterval = setInterval(async () => {
                try {
                    const status = await getAnalysisStatus(scanId);
                    setAnalysisProgress(status.progress || 0, status.message || '');

                    if (status.status === 'completed') {
                        clearInterval(pollInterval);
                        const result = await getAnalysisResult(scanId);
                        setAnalysisResult(result);
                        setAnalysisLoading(false);
                        await fetchScans();
                    } else if (status.status === 'failed') {
                        clearInterval(pollInterval);
                        setAnalysisLoading(false);
                        setError('Analysis failed: ' + status.message);
                    }
                } catch (e) {
                    // Continue polling
                }
            }, 2000);
        } catch (e) {
            // Use demo results
            setAnalysisProgress(50, 'Processing demo data...');
            setTimeout(() => {
                setAnalysisResult(getDemoAnalysisResult());
                setAnalysisLoading(false);
                setAnalysisProgress(100, 'Complete');
            }, 1500);
        }
    };

    const filteredScans = scans.filter(s =>
        s.scan_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Only show demo scans if backend is NOT connected
    const displayScans = filteredScans.length > 0 ? filteredScans : (backendConnected ? [] : getDemoScans());

    const statusIcon = (status) => {
        switch (status) {
            case 'completed': return <CheckCircle size={12} color="var(--success)" />;
            case 'processing': return <Loader2 size={12} color="var(--accent-primary)" className="animate-spin" />;
            case 'failed': return <AlertCircle size={12} color="var(--danger)" />;
            default: return <Clock size={12} color="var(--text-muted)" />;
        }
    };

    return (
        <div style={{
            width: 280,
            minWidth: 280,
            background: 'var(--bg-secondary)',
            borderRight: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
        }}>
            {/* Panel Header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #2a2f3a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Scan Library</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>All</span>
                    <ChevronDown size={12} color="var(--text-muted)" />
                </div>
            </div>

            {/* Scan list */}
            <div 
                className="custom-scrollbar"
                style={{ 
                    flex: 1, 
                    overflowY: 'auto', 
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8
                }}
            >
                {displayScans.map((scan, i) => (
                    <div
                        key={scan.scan_id || i}
                        onClick={() => handleSelectScan(scan.scan_id)}
                        style={{
                            padding: '10px 12px',
                            cursor: 'pointer',
                            background: 'rgba(255,255,255,0.02)',
                            borderRadius: 10,
                            border: `1px solid ${selectedScanId === scan.scan_id ? 'var(--accent-primary)' : '#2a2f3a'}`,
                            position: 'relative',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        {/* Status Badge */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                            {scan.status === 'completed' ? (
                                <div style={{ 
                                    display: 'flex', alignItems: 'center', gap: 4, 
                                    background: 'var(--accent-primary)', color: '#000', 
                                    padding: '3px 8px', borderRadius: 4, fontSize: 9, fontWeight: 800
                                }}>
                                    <CheckCircle size={10} strokeWidth={3} />
                                    Complete
                                </div>
                            ) : (
                                <div style={{ 
                                    display: 'flex', alignItems: 'center', gap: 4, 
                                    background: 'rgba(255,140,0,0.2)', color: 'var(--accent-primary)', 
                                    padding: '3px 8px', borderRadius: 4, fontSize: 9, fontWeight: 800
                                }}>
                                    <Activity size={10} />
                                    {scan.status === 'processing' ? 'Processing...' : 'Uploaded'}
                                </div>
                            )}
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleStartAnalysis(scan.scan_id, e); }}
                                style={{ 
                                    background: 'rgba(255,140,0,0.1)', border: '1px solid var(--accent-primary)', 
                                    color: 'var(--accent-primary)', padding: '2px 6px', borderRadius: 4, 
                                    fontSize: 9, cursor: 'pointer', fontWeight: 700 
                                }}
                                title="Re-run analysis with latest coloring"
                            >
                                Re-analyze
                            </button>
                            <button 
                                onClick={(e) => handleDelete(scan.scan_id, e)}
                                style={{ background: 'none', border: 'none', marginLeft: 8, cursor: 'pointer', color: '#ef4444', opacity: 0.6 }}
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>

                        {/* Name and ID */}
                        <div style={{ marginBottom: 10 }}>
                            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{scan.scan_name}</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-muted)' }}>
                                <Clock size={10} />
                                {new Date(scan.upload_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                <span>ID: {scan.scan_id?.substring(0, 4) || '1029'}</span>
                            </div>
                        </div>

                        {/* Metadata Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
                            <div>
                                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>Points</div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-primary)' }}>
                                    {scan.num_points >= 1000000 ? `${(scan.num_points / 1000000).toFixed(1)}M` : scan.num_points}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>Size</div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>
                                    {scan.file_size?.toFixed(2)}MB
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>Quality</div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-primary)' }}>
                                    {scan.quality}%
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>Acc.</div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>
                                    {scan.accuracy}%
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}


// Demo data for UI preview
function getDemoScans() {
    return []; // Removed confusing demo data to ensure user sees real status
}

function getDemoAnalysisResult() {
    const setColors = ['#991B1B', '#1E3A8A', '#064E3B', '#854D0E', '#4C1D95', '#7C2D12']; // Deep, dark versions of typical set colors
    const setNames = ['Set 1 (Primary)', 'Set 2 (Secondary)', 'Set 3 (Tertiary)', 'Set 4 (Quaternary)', 'Set 5 (Quinary)', 'Set 6 (Senary)'];
    
    const planes = [];
    for (let i = 0; i < 24; i++) {
        const setIdx = i % 6;
        planes.push({
            id: i,
            set_id: setIdx,
            dip: 20 + Math.random() * 60,
            dip_direction: Math.random() * 360,
            strike: Math.random() * 360,
            normal: [Math.random() - 0.5, Math.random() - 0.5, Math.random()],
            centroid: [(Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 4],
            area: 2 + Math.random() * 15,
            num_points: 100 + Math.floor(Math.random() * 2000),
            confidence: 0.7 + Math.random() * 0.3,
            color: setColors[setIdx],
        });
    }

    const sets = [];
    for (let s = 0; s < 6; s++) {
        const setPlanes = planes.filter(p => p.set_id === s);
        sets.push({
            set_id: s,
            name: setNames[s],
            color: setColors[s],
            num_planes: setPlanes.length,
            mean_dip: 30 + s * 10 + Math.random() * 5,
            mean_dip_direction: s * 60 + Math.random() * 10,
            mean_strike: (s * 60 - 90 + 360) % 360,
            std_dip: 3 + Math.random() * 5,
            std_dip_direction: 5 + Math.random() * 8,
            total_points: setPlanes.reduce((sum, p) => sum + p.num_points, 0),
        });
    }

    const result = {
        scan_id: 'demo-001',
        status: 'completed',
        num_planes: planes.length,
        num_sets: sets.length,
        planes,
        sets,
        insights: [
            { category: 'optimization', severity: 'low', title: 'Favorable blast geometry — Set 1', description: 'Discontinuity Set 1 dips toward the free face, promoting forward rock movement during blasting.', recommendation: 'Good forward blast movement expected. Optimize fragmentation by adjusting burden and spacing.', related_sets: [0] },
            { category: 'risk', severity: 'high', title: 'Back-break risk — Set 3', description: 'Discontinuity Set 3 dips against the free face direction, creating significant back-break risk.', recommendation: 'Consider pre-splitting along the perimeter and reducing charge in back-row holes.', related_sets: [2] },
            { category: 'safety', severity: 'high', title: 'Sub-vertical discontinuity — Set 5', description: 'Set 5 contains near-vertical joints that can create loose blocks in the roof and walls.', recommendation: 'Install rock bolts across this discontinuity set. Monitor for wedge formation.', related_sets: [4] },
            { category: 'optimization', severity: 'medium', title: 'Uneven fragmentation potential — Set 2', description: 'Set 2 is oriented perpendicular to the free face causing uneven fragmentation patterns.', recommendation: 'Consider adjusting drill pattern orientation to be more aligned with the discontinuity strike.', related_sets: [1] },
        ],
        point_cloud_data: generateDemoPointCloud(),
        processing_time: 12.4,
    };

    // Generate high-contrast set colorization for the point cloud
    const pc = result.point_cloud_data;
    const setColorsRGB = sets.map(s => {
        const c = new THREE.Color(s.color);
        return [c.r, c.g, c.b];
    });
    
    // Background color: Light gray for contrast (matches required output)
    const bgColor = [0.88, 0.88, 0.88]; // #e0e0e0 equivalent in 0-1 range

    const setPointColors = pc.positions.map((pos, i) => {
        // Assign some points to sets for demo (random but clustered)
        const planeIdx = Math.floor(Math.random() * (planes.length + 10)); // Extra for background
        if (planeIdx < planes.length) {
            const setIdx = planes[planeIdx].set_id;
            return setColorsRGB[setIdx];
        }
        return bgColor;
    });

    result.point_cloud_data.set_colors = setPointColors;
    return result;
}

function generateDemoPointCloud() {
    const n = 15000;
    const positions = [];
    const colors = [];

    // Generate a tunnel-like structure
    for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 4;
        const angle = Math.random() * Math.PI * 2;
        const r = 2.5 + Math.random() * 0.3;
        const x = Math.cos(angle) * r + (Math.random() - 0.5) * 0.2;
        const y = t * 1.5 - 10 + (Math.random() - 0.5) * 0.3;
        const z = Math.sin(angle) * r + (Math.random() - 0.5) * 0.2;

        positions.push([
            parseFloat(x.toFixed(3)),
            parseFloat(y.toFixed(3)),
            parseFloat(z.toFixed(3))
        ]);

        const height = (z + 3) / 6;
        colors.push([
            parseFloat((0.7 + 0.3 * height).toFixed(3)),
            parseFloat((0.3 + 0.2 * height).toFixed(3)),
            parseFloat((0.1 + 0.1 * (1 - height)).toFixed(3))
        ]);
    }

    return { positions, colors, num_points: n };
}
