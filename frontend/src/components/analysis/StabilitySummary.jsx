'use client';

import React from 'react';
import { Shield, AlertTriangle, Activity, Zap, Info } from 'lucide-react';
import useStore from '@/store/useStore';

export default function StabilitySummary() {
    const { analysisResult } = useStore();
    
    if (!analysisResult) return null;
    
    const { sets = [], insights = [] } = analysisResult;
    
    // Derived metrics (Mocked for prototype)
    const factorOfSafety = (1.2 + Math.random() * 0.4).toFixed(2);
    const rmrValue = (65 + Math.random() * 15).toFixed(0);
    const riskLevel = insights.some(i => i.severity === 'high') ? 'High' : (insights.some(i => i.severity === 'medium') ? 'Medium' : 'Low');
    const riskColor = riskLevel === 'High' ? 'var(--danger)' : (riskLevel === 'Medium' ? 'var(--warning)' : 'var(--success)');

    return (
        <div style={{ marginTop: 20 }}>
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr 1fr', 
                gap: 14 
            }}>
                {/* 1. Stability Card */}
                <div style={cardStyle('var(--bg-secondary)')}>
                    <div style={headerStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Shield size={16} color="var(--success)" />
                            <span style={titleStyle}>Kinematic Stability</span>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--success)', background: 'rgba(34, 197, 94, 0.1)', padding: '2px 6px', borderRadius: 4 }}>STABLE</span>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                            <div>
                                <div style={labelStyle}>Factor of Safety (FoS)</div>
                                <div style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>{factorOfSafety}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={labelStyle}>Bench Design</div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Optimal</div>
                            </div>
                        </div>
                        
                        <div style={{ height: 6, background: 'var(--bg-primary)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${(factorOfSafety / 2) * 100}%`, height: '100%', background: 'var(--success)' }} />
                        </div>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                            Low probability of planar or wedge failure detected for current bench orientation.
                        </p>
                    </div>
                </div>

                {/* 2. Rock Mass Quality Card */}
                <div style={cardStyle('var(--bg-secondary)')}>
                    <div style={headerStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Activity size={16} color="var(--info)" />
                            <span style={titleStyle}>Rock Mass Characteristics</span>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--info)', background: 'rgba(59, 130, 246, 0.1)', padding: '2px 6px', borderRadius: 4 }}>GOOD</span>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                            <div>
                                <div style={labelStyle}>RMR (Estimated)</div>
                                <div style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>{rmrValue}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={labelStyle}>Join Set Count</div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{sets.length} Sets</div>
                            </div>
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div style={miniStatStyle}>
                                <div style={miniLabelStyle}>Persistence</div>
                                <div style={miniValueStyle}>Low-Med</div>
                            </div>
                            <div style={miniStatStyle}>
                                <div style={miniLabelStyle}>Joint Cond.</div>
                                <div style={miniValueStyle}>Rough</div>
                            </div>
                        </div>
                        
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                            Estimated based on joint frequency and surface roughness analysis from LiDAR data.
                        </p>
                    </div>
                </div>

                {/* 3. Safety & Intervention Card */}
                <div style={cardStyle('var(--bg-secondary)')}>
                    <div style={headerStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AlertTriangle size={16} color={riskColor} />
                            <span style={titleStyle}>Safety & Intervention</span>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: riskColor, background: `${riskColor}11`, padding: '2px 6px', borderRadius: 4 }}>{riskLevel.toUpperCase()} RISK</span>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(245, 158, 11, 0.05)', padding: 10, borderRadius: 8, border: '1px solid rgba(245, 158, 11, 0.1)' }}>
                            <Zap size={18} color="var(--warning)" />
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>Recommended Action</div>
                                <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Increase support density in NW sector (Set 2 intersection).</div>
                            </div>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                             <CheckItem text="Secondary bolting required: No" checked />
                             <CheckItem text="Visual inspection interval: 24h" />
                             <CheckItem text="Scaling required: Minimal" checked />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function CheckItem({ text, checked }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: checked ? 'var(--success)' : 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {checked && <div style={{ width: 6, height: 6, borderRadius: 1, background: '#fff' }} />}
            </div>
            <span style={{ color: checked ? 'var(--text-primary)' : 'var(--text-muted)' }}>{text}</span>
        </div>
    );
}

// Styles
const cardStyle = (bg) => ({
    background: bg,
    borderRadius: 12,
    padding: 18,
    border: '1px solid #2a2f3a',
    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16
});

const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
};

const titleStyle = {
    fontSize: 12,
    fontWeight: 800,
    color: '#fff',
    letterSpacing: 0.5,
    textTransform: 'uppercase'
};

const labelStyle = {
    fontSize: 9,
    color: 'var(--text-muted)',
    fontWeight: 600,
    textTransform: 'uppercase',
    marginBottom: 2
};

const miniStatStyle = {
    background: 'rgba(255,255,255,0.02)',
    borderRadius: 6,
    padding: '6px 8px',
    border: '1px solid #2a2f3a'
};

const miniLabelStyle = {
    fontSize: 8,
    color: 'var(--text-muted)',
    marginBottom: 2
};

const miniValueStyle = {
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--text-primary)'
};
