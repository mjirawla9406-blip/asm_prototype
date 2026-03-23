'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import useStore from '@/store/useStore';

function PoleDensityPoints({ planes }) {
    const points = useMemo(() => {
        if (!planes?.length) return { positions: [], colors: [] };
        
        const pos = [];
        const cols = [];
        
        planes.forEach(p => {
            const dip = (p.dip * Math.PI) / 180;
            const dir = ((p.dip_direction - 90) * Math.PI) / 180;
            
            // Project onto hemisphere (radius 3)
            const r = 3;
            const x = r * Math.sin(dip) * Math.cos(dir);
            const z = r * Math.sin(dip) * Math.sin(dir);
            const y = r * Math.cos(dip); // Using y as up for the 3D density plot
            
            pos.push(x, y, z);
            
            // Color by set
            const color = new THREE.Color(p.color);
            cols.push(color.r, color.g, color.b);
        });
        
        return { 
            positions: new Float32Array(pos), 
            colors: new Float32Array(cols) 
        };
    }, [planes]);

    if (!points.positions.length) return null;

    return (
        <points>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={points.positions.length / 3}
                    array={points.positions}
                    itemSize={3}
                />
                <bufferAttribute
                    attach="attributes-color"
                    count={points.colors.length / 3}
                    array={points.colors}
                    itemSize={3}
                />
            </bufferGeometry>
            <pointsMaterial vertexColors size={0.15} sizeAttenuation transparent opacity={0.8} />
        </points>
    );
}

function GridHemisphere() {
    return (
        <group>
            {/* Base Circle */}
            <mesh rotation={[Math.PI / 2, 0, 0]}>
                <ringGeometry args={[2.98, 3, 64]} />
                <meshBasicMaterial color="#1e293b" transparent opacity={0.5} side={THREE.DoubleSide} />
            </mesh>
            
            {/* Latitude Circles */}
            {[30, 60].map(angle => {
                const rad = Math.PI * (angle / 180);
                const r = 3 * Math.sin(rad);
                const h = 3 * Math.cos(rad);
                return (
                    <mesh key={angle} position={[0, h, 0]} rotation={[Math.PI / 2, 0, 0]}>
                        <ringGeometry args={[r - 0.01, r + 0.01, 64]} />
                        <meshBasicMaterial color="#1e293b" transparent opacity={0.3} />
                    </mesh>
                );
            })}
            
            {/* Longitude Lines */}
            {[0, 45, 90, 135].map(angle => {
                const rad = Math.PI * (angle / 180);
                return (
                    <mesh key={angle} rotation={[0, rad, 0]}>
                        <ringGeometry args={[2.99, 3, 64, 1, 0, Math.PI]} />
                        <meshBasicMaterial color="#1e293b" transparent opacity={0.2} side={THREE.DoubleSide} />
                    </mesh>
                );
            })}
        </group>
    );
}

export default function DensityPlot() {
    const { analysisResult, visibleSets } = useStore();
    
    const planes = useMemo(() => {
        if (!analysisResult?.planes) return [];
        return analysisResult.planes.filter(p => visibleSets.has(p.set_id));
    }, [analysisResult, visibleSets]);

    return (
        <div style={{ 
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            background: 'var(--bg-tertiary)', borderRadius: 8, padding: 6,
            border: '1px solid var(--border-color)',
            overflow: 'hidden'
        }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, textTransform: 'uppercase', zIndex: 1 }}>
                3D Orientation Density
            </div>
            
            <div style={{ flex: 1, position: 'relative' }}>
                <Canvas camera={{ position: [5, 5, 5], fov: 35 }}>
                    <ambientLight intensity={0.8} />
                    <pointLight position={[10, 10, 10]} intensity={1.2} />
                    
                    <GridHemisphere />
                    <PoleDensityPoints planes={planes} />
                    
                    <OrbitControls makeDefault enableDamping dampingFactor={0.05} />
                </Canvas>
            </div>

            <div style={{ 
                position: 'absolute', bottom: 8, left: 10, 
                fontSize: 8, color: 'var(--text-muted)', lineHeight: 1.2
            }}>
                Poles on Upper Hemisphere<br/>
                Scale: 1:1
            </div>
        </div>
    );
}
