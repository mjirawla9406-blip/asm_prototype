'use client';

import { useMemo } from 'react';
import useStore from '@/store/useStore';

export default function StereonetPlot() {
    const { analysisResult, selectedPlaneId, setSelectedPlaneId, visibleSets } = useStore();
    
    const planes = useMemo(() => {
        if (!analysisResult?.planes) return [];
        return analysisResult.planes.filter(p => visibleSets.has(p.set_id));
    }, [analysisResult, visibleSets]);

    // Constants for projection
    const size = 220;
    const padding = 12;
    const radius = (size - padding * 2) / 2;
    const centerX = size / 2;
    const centerY = size / 2;

    // Equal-area (Schmidt) projection
    const project = (dip, dipDirection) => {
        const dipRad = (dip * Math.PI) / 180;
        const dirRad = ((dipDirection - 90) * Math.PI) / 180;
        
        const rNorm = Math.sqrt(2) * Math.sin(dipRad / 2);
        const rScale = rNorm / Math.sqrt(2);
        
        const x = centerX + radius * rScale * Math.cos(dirRad);
        const y = centerY + radius * rScale * Math.sin(dirRad);
        return { x, y };
    };

    return (
        <div style={{ 
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            background: 'var(--bg-tertiary)', borderRadius: 8, padding: 6,
            border: '1px solid var(--border-color)'
        }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, textTransform: 'uppercase' }}>
                Stereonet (Poles)
            </div>
            
            <div style={{ flex: 1, position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                    {/* Outer Circle */}
                    <circle cx={centerX} cy={centerY} r={radius} fill="none" stroke="var(--border-color)" strokeWidth="1" />
                    
                    {/* Cardinal Directions */}
                    <text x={centerX} y={padding - 4} textAnchor="middle" fontSize="9" fill="var(--text-muted)">N</text>
                    <text x={centerX} y={size - padding + 12} textAnchor="middle" fontSize="9" fill="var(--text-muted)">S</text>
                    <text x={size - padding + 12} y={centerY + 3} textAnchor="middle" fontSize="9" fill="var(--text-muted)">E</text>
                    <text x={padding - 12} y={centerY + 3} textAnchor="middle" fontSize="9" fill="var(--text-muted)">W</text>

                    {/* Dip Grid (30, 60 deg) */}
                    {[30, 60].map(d => {
                        const rNorm = Math.sqrt(2) * Math.sin((d * Math.PI) / 180 / 2);
                        const rScale = rNorm / Math.sqrt(2);
                        return (
                            <circle 
                                key={d} 
                                cx={centerX} cy={centerY} r={radius * rScale} 
                                fill="none" stroke="var(--border-color)" 
                                strokeWidth="0.5" strokeDasharray="2,2" 
                            />
                        );
                    })}

                    {/* Directional Grid */}
                    {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => {
                        const rad = (deg * Math.PI) / 180;
                        return (
                            <line 
                                key={deg}
                                x1={centerX} y1={centerY}
                                x2={centerX + radius * Math.cos(rad)}
                                y2={centerY + radius * Math.sin(rad)}
                                stroke="var(--border-color)" strokeWidth="0.5" strokeDasharray="2,2"
                            />
                        );
                    })}

                    {/* Point Poles */}
                    {planes.map(p => {
                        const { x, y } = project(p.dip, p.dip_direction);
                        const isSelected = selectedPlaneId === p.id;
                        return (
                            <g key={p.id} onClick={() => setSelectedPlaneId(p.id)} style={{ cursor: 'pointer' }}>
                                {isSelected && (
                                    <circle cx={x} cy={y} r="6" fill={p.color} opacity="0.3" />
                                )}
                                <circle 
                                    cx={x} cy={y} r={isSelected ? "4" : "3"} 
                                    fill={p.color} 
                                    stroke="#fff" strokeWidth={isSelected ? "1.5" : "0.5"}
                                    style={{ transition: 'all 0.2s' }}
                                />
                                {isSelected && (
                                    <text x={x+6} y={y-6} fontSize="9" fontWeight="700" fill={p.color}>P{p.id}</text>
                                )}
                            </g>
                        );
                    })}
                </svg>
            </div>

            {/* Legend Overlay */}
            <div style={{ 
                position: 'absolute', bottom: 12, right: 12, 
                fontSize: 9, color: 'var(--text-muted)', textAlign: 'right'
            }}>
                Equal-Area (Schmidt) Projection<br/>
                Radius: Dip 90°
            </div>
        </div>
    );
}
