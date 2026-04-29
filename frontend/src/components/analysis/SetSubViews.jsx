'use client';

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import useStore from '@/store/useStore';

function SetPreview({ set, planes, allSets }) {
    const setPlanes = useMemo(() => 
        planes.filter(p => p.set_id === set.set_id),
    [planes, set.set_id]);

    const avgCentroid = useMemo(() => {
        if (!setPlanes.length) return [0, 0, 0];
        const sum = setPlanes.reduce((acc, p) => [acc[0] + p.centroid[0], acc[1] + p.centroid[1], acc[2] + p.centroid[2]], [0, 0, 0]);
        return sum.map(v => v / setPlanes.length);
    }, [setPlanes]);

    return (
        <div style={{ 
            flex: '0 0 150px', height: 150, 
            background: 'var(--bg-primary)', borderRadius: 6,
            border: `1px solid ${set.color}44`, display: 'flex', flexDirection: 'column',
            overflow: 'hidden', position: 'relative'
        }}>
            <div style={{ 
                padding: '3px 6px', fontSize: 9, fontWeight: 700, 
                color: set.color, background: `${set.color}11`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
                <span>SET {set.set_id + 1}</span>
                <span style={{ fontSize: 8, opacity: 0.7 }}>{setPlanes.length} planes</span>
            </div>
            
            <div style={{ flex: 1, position: 'relative' }}>
                {allSets.indexOf(set) < 12 ? (
                    <Canvas camera={{ position: [avgCentroid[0] + 3, avgCentroid[1] + 3, avgCentroid[2] + 3], fov: 40 }}>
                        <ambientLight intensity={1.5} />
                        <pointLight position={[avgCentroid[0] + 5, avgCentroid[1] + 5, avgCentroid[2] + 5]} intensity={2.0} />
                        
                        <group position={[0, 0, 0]}>
                            {setPlanes.map(p => {
                                const centroid = new THREE.Vector3(...p.centroid);
                                const normal = new THREE.Vector3(...p.normal).normalize();
                                const up = new THREE.Vector3(0, 0, 1);
                                const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normal);
                                const size = Math.sqrt(p.area || 1);
                                const clampedSize = Math.max(0.2, Math.min(size, 1.2));

                                return (
                                    <mesh key={p.id} position={centroid} quaternion={quaternion}>
                                        <planeGeometry args={[clampedSize, clampedSize]} />
                                        <meshBasicMaterial color={p.color} side={THREE.DoubleSide} transparent opacity={0.6} />
                                    </mesh>
                                );
                            })}
                        </group>
                        
                        <OrbitControls makeDefault enableZoom={false} target={new THREE.Vector3(...avgCentroid)} autoRotate autoRotateSpeed={1.5} />
                    </Canvas>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        {/* 2D Orientation Dial (Fallback for stability when many sets present) */}
                        <svg width="60" height="60" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                            <g transform={`rotate(${set.mean_dip_direction}, 50, 50)`}>
                                <line x1="50" y1="50" x2="50" y2="15" stroke={set.color} strokeWidth="2" strokeLinecap="round" />
                                <circle cx="50" cy="15" r="3" fill={set.color} />
                                <line x1="50" y1="50" x2="50" y2={50 - (set.mean_dip / 90) * 35} 
                                      stroke={set.color} strokeWidth="6" opacity="0.3" strokeLinecap="round" />
                            </g>
                        </svg>
                    </div>
                )}
            </div>

            <div style={{ 
                padding: '2px 6px', fontSize: 8, 
                color: 'var(--text-muted)', background: 'var(--bg-tertiary)',
                display: 'flex', justifyContent: 'space-between'
            }}>
                <span>Dip: {set.mean_dip?.toFixed(0)}°</span>
                <span>Dir: {set.mean_dip_direction?.toFixed(0)}°</span>
            </div>
        </div>
    );
}

export default function SetSubViews() {
    const { analysisResult, visibleSets } = useStore();
    
    const setsToShow = useMemo(() => {
        if (!analysisResult?.sets) return [];
        return analysisResult.sets.filter(s => visibleSets.has(s.set_id));
    }, [analysisResult, visibleSets]);

    if (!setsToShow.length) return null;

    return (
        <div style={{ 
            width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
            background: 'var(--bg-tertiary)', borderRadius: 8, padding: 8,
            border: '1px solid var(--border-color)', overflow: 'hidden'
        }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, textTransform: 'uppercase' }}>
                Set-Specific Characterization
            </div>
            
            <div style={{ 
                flex: 1, display: 'flex', gap: 8, overflowX: 'auto', 
                paddingBottom: 6, scrollbarWidth: 'thin'
            }}>
                {setsToShow.map(s => (
                    <SetPreview key={s.set_id} set={s} planes={analysisResult.planes} allSets={setsToShow} />
                ))}
            </div>
        </div>
    );
}
