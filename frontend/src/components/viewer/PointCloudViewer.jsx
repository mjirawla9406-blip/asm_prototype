'use client';

import { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import useStore from '@/store/useStore';
import { getPointCloudData } from '@/lib/api';
import {
    RotateCcw, Eye, EyeOff, Layers, ArrowUpRight,
    Tag, Grid3X3, Maximize2, Box, Crosshair, Settings2,
    FileText, Plus, Database, Activity, Video, Camera, Ruler, Scissors, Share2, MousePointer2, Image, List, Settings
} from 'lucide-react';

const BRIGHT_COLORS = [
    [0.1, 0.4, 1.0], // Bright Blue
    [0.1, 1.0, 0.4], // Bright Green
    [0.0, 1.0, 1.0], // Bright Cyan
    [1.0, 0.2, 0.2], // Bright Red
    [1.0, 0.1, 1.0], // Bright Magenta
    [1.0, 0.9, 0.0], // Bright Yellow
    [0.6, 1.0, 0.1], // Lime
    [1.0, 0.5, 0.0], // Orange
];

function PointCloudMesh({ positions, colors, pointSize, viewMode }) {
    const ref = useRef();

    const finalColors = useMemo(() => {
        if (!colors || !positions) return null;
        
        const count = positions.length;
        const colorArray = new Float32Array(count * 3);
        
        // Handle different color sources
        for (let i = 0; i < count; i++) {
            // Default to gray if we are in 'original' mode
            if (viewMode === 'original') {
                colorArray[i * 3] = 0.95;
                colorArray[i * 3 + 1] = 0.95;
                colorArray[i * 3 + 2] = 0.95;
                continue;
            }

            // In 'analyzed' mode, use the provided colors array
            if (colors && colors[i]) {
                const r = colors[i][0];
                const g = colors[i][1];
                const b = colors[i][2];

                // Use the provided set color directly from the backend
                colorArray[i * 3] = r;
                colorArray[i * 3 + 1] = g;
                colorArray[i * 3 + 2] = b;
            } else {
                // Fallback for missing colors
                colorArray[i * 3] = 0.95;
                colorArray[i * 3 + 1] = 0.95;
                colorArray[i * 3 + 2] = 0.95;
            }
        }
        return colorArray;
    }, [positions, colors, viewMode]);

    const geometry = useMemo(() => {
        const geo = new THREE.BufferGeometry();
        const posArray = new Float32Array(positions.length * 3);

        for (let i = 0; i < positions.length; i++) {
            posArray[i * 3] = positions[i][0];
            posArray[i * 3 + 1] = positions[i][1];
            posArray[i * 3 + 2] = positions[i][2];
        }

        geo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        if (finalColors) {
            geo.setAttribute('color', new THREE.BufferAttribute(finalColors, 3));
        }
        return geo;
    }, [positions, finalColors]);

    return (
        <points ref={ref} geometry={geometry}>
            <pointsMaterial
                vertexColors={!!finalColors}
                color={!finalColors ? 'white' : undefined}
                size={pointSize * 2.5}
                sizeAttenuation
                transparent={false}
                opacity={1}
                alphaTest={0.5}
            />
        </points>
    );
}

function PlaneOverlays({ planes, visibleSets, selectedPlaneId, onSelectPlane, showNormals, showLabels }) {
    if (!planes?.length) return null;

    return (
        <group>
            {planes.map((plane) => {
                if (!visibleSets.has(plane.set_id)) return null;

                const color = new THREE.Color(plane.color);
                const centroid = new THREE.Vector3(...plane.centroid);
                const normal = new THREE.Vector3(...plane.normal).normalize();
                const isSelected = selectedPlaneId === plane.id;

                // Create plane mesh
                const size = Math.sqrt(plane.area || 4);
                const clampedSize = Math.max(0.5, Math.min(size, 3));

                // Compute rotation from normal
                const up = new THREE.Vector3(0, 0, 1);
                const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normal);

                return (
                    <group key={plane.id} position={centroid}>
                        {/* Semi-transparent plane */}
                        <mesh
                            quaternion={quaternion}
                            onClick={(e) => { e.stopPropagation(); onSelectPlane(plane.id); }}
                        >
                            <planeGeometry args={[clampedSize, clampedSize]} />
                            <meshBasicMaterial
                                color={color}
                                transparent
                                opacity={isSelected ? 0.5 : 0.25}
                                side={THREE.DoubleSide}
                                depthWrite={false}
                            />
                        </mesh>

                        {/* Wireframe */}
                        <mesh quaternion={quaternion}>
                            <planeGeometry args={[clampedSize, clampedSize]} />
                            <meshBasicMaterial
                                color={color}
                                wireframe
                                transparent
                                opacity={isSelected ? 0.8 : 0.4}
                            />
                        </mesh>

                        {/* Normal vector arrow */}
                        {showNormals && (
                            <arrowHelper
                                args={[
                                    normal,
                                    new THREE.Vector3(0, 0, 0),
                                    1.2,
                                    color.getHex(),
                                    0.2,
                                    0.1
                                ]}
                            />
                        )}

                        {/* Label */}
                        {showLabels && (
                            <Html
                                position={[0, 0, 0.3]}
                                style={{
                                    background: 'rgba(0,0,0,0.8)',
                                    color: plane.color,
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    fontSize: 10,
                                    fontWeight: 600,
                                    whiteSpace: 'nowrap',
                                    border: `1px solid ${plane.color}`,
                                    pointerEvents: 'none',
                                }}
                            >
                                P{plane.id} | {plane.dip?.toFixed(0)}°/{plane.dip_direction?.toFixed(0)}°
                            </Html>
                        )}

                        {/* Selection glow ring */}
                        {isSelected && (
                            <mesh quaternion={quaternion}>
                                <ringGeometry args={[clampedSize * 0.5, clampedSize * 0.55, 32]} />
                                <meshBasicMaterial
                                    color={color}
                                    transparent
                                    opacity={0.8}
                                    side={THREE.DoubleSide}
                                />
                            </mesh>
                        )}
                    </group>
                );
            })}
        </group>
    );
}

function SceneSetup() {
    const { camera } = useThree();

    useEffect(() => {
        camera.position.set(12, 10, 12);
        camera.lookAt(0, 4, 0);
    }, [camera]);

    return null;
}

function AnimatedGrid() {
    return (
        <gridHelper
            args={[30, 30, 0x2a2f3a, 0x14161c]}
            position={[0, 0, 0]}
        />
    );
}

export default function PointCloudViewer() {
    const {
        pointCloudData, pointCloudLoading,
        analysisResult, visibleSets,
        selectedPlaneId, setSelectedPlaneId,
        showPlanes, showNormals, showLabels,
        setShowPlanes, setShowNormals, setShowLabels,
        pointSize, setPointSize,
        pointDensity, setPointDensity,
        selectedScanId, setPointCloudData, setPointCloudLoading,
        viewMode, setViewMode,
        layoutMode, setLayoutMode
    } = useStore();

    const [showGrid, setShowGrid] = useState(true);
    const [showControls, setShowControls] = useState(false);
    const [localDensity, setLocalDensity] = useState(pointDensity);
    const densityTimerRef = useRef(null);

    // Sync localDensity when store changes externally
    useEffect(() => { setLocalDensity(pointDensity); }, [pointDensity]);

    // Debounced density change — re-fetches point cloud
    const handleDensityChange = useCallback((newDensity) => {
        setLocalDensity(newDensity);
        if (densityTimerRef.current) clearTimeout(densityTimerRef.current);
        densityTimerRef.current = setTimeout(async () => {
            setPointDensity(newDensity);
            if (selectedScanId) {
                setPointCloudLoading(true);
                try {
                    const pcData = await getPointCloudData(selectedScanId, newDensity);
                    setPointCloudData(pcData);
                } catch (e) {
                    console.error('Failed to re-fetch point cloud:', e);
                } finally {
                    setPointCloudLoading(false);
                }
            }
        }, 500);
    }, [selectedScanId, setPointDensity, setPointCloudData, setPointCloudLoading]);

    const containerRef = useRef(null);

    const takeScreenshot = useCallback(() => {
        const canvas = containerRef.current.querySelector('canvas');
        if (canvas) {
            const dataURL = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `mine-scan-${new Date().getTime()}.png`;
            link.href = dataURL;
            link.click();
        }
    }, []);

    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    }, []);

    const planes = analysisResult?.planes || [];
    const pcData = analysisResult?.point_cloud_data || pointCloudData;
    
    // Choose colors based on view mode and availability
    let colors = pcData?.colors;
    if (viewMode === 'analyzed' && analysisResult?.point_cloud_data) {
        // Prefer set_colors if available, otherwise fallback to colors
        if (!analysisResult.point_cloud_data.set_colors) {
            console.warn('DEBUG - set_colors key is MISSING or FALSY');
        } else {
            console.log('DEBUG - set_colors size:', analysisResult.point_cloud_data.set_colors.length);
            console.log('DEBUG - set_colors first 5:', JSON.stringify(analysisResult.point_cloud_data.set_colors.slice(0, 5)));
        }
        
        if (analysisResult.point_cloud_data.set_colors && analysisResult.point_cloud_data.set_colors.length > 0) {
            colors = analysisResult.point_cloud_data.set_colors;
            console.log('DEBUG - Using set_colors for rendering');
        } else {
            console.warn('DEBUG - Falling back to original colors');
            colors = analysisResult.point_cloud_data.colors;
        }
    }

    const renderMain3D = () => (
        <div style={{ flex: 1, position: 'relative', height: '100%', minHeight: 0 }}>
            {pointCloudLoading && (
                <div style={{
                    position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 20, flexDirection: 'column', gap: 12,
                }}>
                    <div style={{
                        width: 40, height: 40, border: '3px solid var(--border-color)',
                        borderTopColor: 'var(--accent-primary)', borderRadius: '50%',
                        animation: 'spin-slow 1s linear infinite',
                    }} />
                    <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading point cloud...</div>
                </div>
            )}

            {!pcData && !pointCloudLoading && (
                <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexDirection: 'column', gap: 12,
                    zIndex: 10, pointerEvents: 'none',
                }}>
                    <Box size={48} color="var(--text-muted)" strokeWidth={1} />
                    <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                        Select a scan to view the point cloud
                    </div>
                </div>
            )}

            <Canvas
                camera={{ position: [10, 8, 10], fov: 50 }}
                gl={{ antialias: true, alpha: true }}
                style={{ background: 'linear-gradient(180deg, #0f172a 0%, #0a0e17 50%, #0f172a 100%)' }}
            >
                <SceneSetup />

                {/* Lighting */}
                <ambientLight intensity={0.5} />
                <directionalLight position={[10, 10, 5]} intensity={0.8} />
                <directionalLight position={[-10, -5, -5]} intensity={0.3} />

                {/* Grid */}
                {showGrid && <AnimatedGrid />}

                {/* Centering Group with Z-up Rotation */}
                {pcData?.positions && (() => {
                    const positions = pcData.positions;
                    let min = [Infinity, Infinity, Infinity];
                    let max = [-Infinity, -Infinity, -Infinity];
                    
                    if (pcData.bbox) {
                        min = pcData.bbox.min;
                        max = pcData.bbox.max;
                    } else {
                        for (let i = 0; i < positions.length; i++) {
                            const p = positions[i];
                            min[0] = Math.min(min[0], p[0]); min[1] = Math.min(min[1], p[1]); min[2] = Math.min(min[2], p[2]);
                            max[0] = Math.max(max[0], p[0]); max[1] = Math.max(max[1], p[1]); max[2] = Math.max(max[2], p[2]);
                        }
                    }

                    const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
                    const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
                    
                    // In mining, Z is usually UP. In Three.js, Y is UP.
                    // If we rotate the group by -90 deg around X, original Z becomes Three.js Y.
                    // The "height" in the original coord system was Z (size[2]).
                    return (
                        <group 
                            position={[0, size[2] / 2, 0]} 
                            rotation={[-Math.PI / 2, 0, 0]}
                        >
                            <group position={[-center[0], -center[1], -center[2]]}>
                                <PointCloudMesh
                                    key={`${selectedScanId}-${viewMode}-${pcData?.positions?.length}`}
                                    positions={pcData?.positions}
                                    colors={colors}
                                    pointSize={pointSize}
                                    viewMode={viewMode}
                                />
                                {showPlanes && planes.length > 0 && (
                                    <PlaneOverlays
                                        planes={planes}
                                        visibleSets={visibleSets}
                                        selectedPlaneId={selectedPlaneId}
                                        onSelectPlane={setSelectedPlaneId}
                                        showNormals={showNormals}
                                        showLabels={showLabels}
                                    />
                                )}
                            </group>
                        </group>
                    );
                })()}

                {/* Controls */}
                <OrbitControls
                    makeDefault
                    enablePan
                    enableZoom
                    enableRotate
                    dampingFactor={0.05}
                    minDistance={2}
                    maxDistance={50}
                />

                {/* Gizmo */}
                <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
                    <GizmoViewport
                        axisColors={['#FF4444', '#44DD44', '#4488FF']}
                        labelColor="white"
                    />
                </GizmoHelper>
            </Canvas>

            {/* Point count badge */}
            {pcData && (
                <div style={{
                    position: 'absolute', bottom: 12, left: 12,
                    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
                    padding: '6px 12px', borderRadius: 8,
                    border: '1px solid var(--border-color)',
                    fontSize: 11, color: 'var(--text-secondary)',
                    display: 'flex', gap: 12, alignItems: 'center',
                }}>
                    <span><strong style={{ color: 'var(--accent-primary)' }}>{pcData.num_points?.toLocaleString()}</strong> points</span>
                    {pcData.has_real_colors && (
                        <span style={{ color: 'var(--success)', fontWeight: 600 }}>● RGB</span>
                    )}
                    {planes.length > 0 && (
                        <span><strong style={{ color: 'var(--info)' }}>{planes.length}</strong> planes</span>
                    )}
                    {analysisResult?.num_sets > 0 && (
                        <span><strong style={{ color: 'var(--success)' }}>{analysisResult.num_sets}</strong> sets</span>
                    )}
                </div>
            )}

            {/* Point Cloud Controls Panel */}
            {showControls && (
                <div style={{
                    position: 'absolute', bottom: 12, right: 12,
                    background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)',
                    padding: '14px 16px', borderRadius: 12,
                    border: '1px solid var(--border-color)',
                    minWidth: 220, zIndex: 15,
                }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase' }}>Point Cloud Controls</div>
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Point Size</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-primary)' }}>{pointSize.toFixed(3)}</span>
                        </div>
                        <input type="range" min="0.005" max="0.15" step="0.005" value={pointSize} onChange={(e) => setPointSize(parseFloat(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent-primary)' }} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Point Density</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--info)' }}>{localDensity >= 1000 ? `${(localDensity/1000).toFixed(0)}K` : localDensity}</span>
                        </div>
                        <input type="range" min="10000" max="500000" step="10000" value={localDensity} onChange={(e) => handleDensityChange(parseInt(e.target.value))} style={{ width: '100%', accentColor: 'var(--info)' }} />
                    </div>
                </div>
            )}

            {/* Set legend overlay in main view */}
            {analysisResult?.sets?.length > 0 && layoutMode === 'single' && (
                <div style={{
                    position: 'absolute', top: 12, right: 12,
                    background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
                    padding: '10px 14px', borderRadius: 10,
                    border: '1px solid var(--border-color)',
                    minWidth: 150,
                }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                        Discontinuity Sets
                    </div>
                    {analysisResult.sets.map(s => (
                        <div
                            key={s.set_id}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '4px 0', cursor: 'pointer', fontSize: 12,
                                opacity: visibleSets.has(s.set_id) ? 1 : 0.4,
                                transition: 'opacity 0.2s',
                            }}
                            onClick={() => useStore.getState().toggleSetVisibility(s.set_id)}
                        >
                            <span className="color-dot" style={{ background: s.color }} />
                            <span style={{ color: 'var(--text-secondary)', flex: 1 }}>Set {s.set_id + 1}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{s.num_planes}p</span>
                            {visibleSets.has(s.set_id) ? <Eye size={12} color="var(--text-muted)" /> : <EyeOff size={12} color="var(--text-muted)" />}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: '#0d1117',
            position: 'relative',
            overflow: 'hidden',
        }}>
            {/* Viewer Header - Aligned with Platform */}
            <div ref={containerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Toolbar Header */}
            <div style={{
                height: 44, background: 'var(--bg-secondary)', borderBottom: '1px solid #2a2f3a',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px',
                flexShrink: 0
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Database size={15} color="var(--accent-primary)" />
                        <h3 style={{ fontSize: 12, fontWeight: 700, color: '#fff', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>3D Point Cloud Viewer</h3>
                    </div>
                    
                    <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: 2 }}>
                        <button 
                            onClick={() => setViewMode('original')}
                            style={{
                                padding: '4px 10px', border: 'none', borderRadius: 4, fontSize: 10, fontWeight: 700,
                                background: viewMode === 'original' ? '#2a2f3a' : 'transparent',
                                color: viewMode === 'original' ? 'var(--accent-primary)' : 'var(--text-muted)',
                                cursor: 'pointer', transition: 'all 0.2s',
                                display: 'flex', alignItems: 'center', gap: 4
                            }}
                        >
                            <Box size={12} /> Before
                        </button>
                        <button 
                            onClick={() => setViewMode('analyzed')}
                            style={{
                                padding: '4px 10px', border: 'none', borderRadius: 4, fontSize: 10, fontWeight: 700,
                                background: viewMode === 'analyzed' ? '#2a2f3a' : 'transparent',
                                color: viewMode === 'analyzed' ? 'var(--accent-primary)' : 'var(--text-muted)',
                                cursor: 'pointer', transition: 'all 0.2s',
                                display: 'flex', alignItems: 'center', gap: 4
                            }}
                        >
                            <Activity size={12} /> After
                        </button>
                    </div>
                </div>

                {/* Toolbar Icons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <Camera size={16} color="var(--text-secondary)" style={{ cursor: 'pointer' }} onClick={takeScreenshot} title="Capture View" />
                    
                    <MousePointer2 
                        size={16} 
                        color={showLabels ? 'var(--accent-primary)' : 'var(--text-secondary)'} 
                        style={{ cursor: 'pointer' }} 
                        onClick={() => setShowLabels(!showLabels)}
                        title="Toggle Labels" 
                    />

                    <Grid3X3
                        size={16}
                        color={layoutMode === 'multi' ? 'var(--accent-cyan)' : 'var(--text-secondary)'}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setLayoutMode(layoutMode === 'multi' ? 'single' : 'multi')}
                        title="Toggle Multi-View Dashboard"
                    />

                    <List 
                        size={16} 
                        color={showPlanes ? 'var(--accent-primary)' : 'var(--text-secondary)'} 
                        style={{ cursor: 'pointer' }} 
                        onClick={() => setShowPlanes(!showPlanes)}
                        title="Toggle Analysis Planes" 
                    />

                    <Settings
                        size={16}
                        color={showControls ? 'var(--accent-primary)' : 'var(--text-secondary)'}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setShowControls(!showControls)}
                        title="Point Controls" 
                    />

                    <div style={{ width: 1, height: 16, background: '#2a2f3a', margin: '0 2px' }} />

                    <Maximize2 size={16} color="var(--text-secondary)" style={{ cursor: 'pointer' }} onClick={toggleFullscreen} title="Fullscreen" />
                </div>
            </div>

            {/* Content Area - always shows just the 3D viewer */}
            <div style={{ flex: 1, position: 'relative', display: 'flex', minHeight: 0 }}>
                {renderMain3D()}
            </div>
        </div>
    </div>
  );
}
