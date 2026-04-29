'use client';

import { useState, useMemo } from 'react';
import {
    Table, BarChart3, AlertTriangle, Lightbulb,
    TrendingUp, ChevronDown, ChevronUp, Shield,
    Target, Zap, ChevronRight, ChevronLeft, Layers,
    Download, FileText, Image as ImageIcon, CheckCircle2,
    Activity, Database, Crosshair, GitBranch
} from 'lucide-react';
import useStore from '@/store/useStore';
import dynamic from 'next/dynamic';
import StabilitySummary from './StabilitySummary';
import { downloadReport } from '@/lib/api';

// Dynamically import charts (avoid SSR issues with Chart.js)
const Charts = dynamic(() => import('./Charts'), { ssr: false });

export default function StructuralDashboard() {
    const {
        analysisResult, asmResult, rightPanelTab, setRightPanelTab,
        selectedPlaneId, setSelectedPlaneId, visibleSets,
        dashboardCollapsed, setDashboardCollapsed, selectedScanId
    } = useStore();

    const activeResult = asmResult || analysisResult;
    if (!activeResult) return null;

    const planes = activeResult?.planes || [];
    const sets = asmResult?.joint_sets || analysisResult?.sets || [];
    const insights = analysisResult?.insights || [];
    const processing_time = activeResult?.processing_time || 0;

    const tabs = [
        { id: 'pipeline', label: 'Pipeline', icon: GitBranch },
        { id: 'planes', label: 'Planes', icon: Table, count: planes.length },
        { id: 'sets', label: 'Sets', icon: Layers, count: sets.length },
        { id: 'insights', label: 'Insights', icon: Lightbulb, count: insights.length },
        { id: 'charts', label: 'Charts', icon: BarChart3 },
        { id: 'summary', label: 'Summary', icon: Activity },
    ];

    if (dashboardCollapsed) {
        return (
            <div style={{
                width: 40, minWidth: 40, flexShrink: 0, background: 'var(--bg-secondary)',
                borderRight: '1px solid var(--border-color)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0',
                cursor: 'pointer',
            }} onClick={() => setDashboardCollapsed(false)}>
                <ChevronRight size={18} color="var(--text-muted)" />
                <div style={{
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                    marginTop: 20,
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                }}>
                    Structural Analysis
                </div>
            </div>
        );
    }

    return (
        <div style={{
            width: '100%', flexShrink: 0, background: 'var(--bg-secondary)',
            borderRight: '1px solid var(--border-color)',
            display: 'flex', flexDirection: 'column', height: '100%',
        }}>
            {/* Header */}
            <div style={{
                padding: '8px 10px',
                borderBottom: '1px solid var(--border-color)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button 
                            onClick={() => setDashboardCollapsed(true)}
                            style={{ 
                                background: 'transparent', border: 'none', cursor: 'pointer',
                                padding: 2, borderRadius: 4, display: 'flex', alignItems: 'center',
                                color: 'var(--text-muted)',
                            }}
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <h3 style={{ fontSize: 13, fontWeight: 700 }}>Analysis</h3>
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {processing_time?.toFixed(1)}s
                    </span>
                </div>

                {/* Summary stats */}
                <div style={{
                    display: 'flex', gap: 4, marginBottom: 8,
                    justifyContent: 'space-between'
                }}>
                    <StatBox label="Planes" value={planes.length} color="var(--info)" />
                    <StatBox label="Sets" value={sets.length} color="var(--success)" />
                    <StatBox label="Ins." value={insights.length} color="var(--warning)" />
                </div>

                {/* Tabs */}
                <div className="tab-bar" style={{ display: 'flex', gap: '2px', padding: '2px', background: 'var(--bg-primary)', borderRadius: '6px' }}>
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            className={`tab-item ${rightPanelTab === tab.id ? 'active' : ''}`}
                            onClick={() => setRightPanelTab(tab.id)}
                            style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '4px 2px',
                                minWidth: 0,
                                fontSize: 9,
                                borderRadius: '4px'
                            }}
                        >
                            <tab.icon size={11} style={{ flexShrink: 0, marginRight: 2 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
                {rightPanelTab === 'pipeline' && (
                    <PipelineTab scanId={selectedScanId} />
                )}
                {rightPanelTab === 'planes' && (
                    <PlanesTab planes={planes} selectedId={selectedPlaneId} onSelect={setSelectedPlaneId} />
                )}
                {rightPanelTab === 'sets' && (
                    <SetsTab sets={sets} />
                )}
                {rightPanelTab === 'insights' && (
                    <InsightsTab insights={insights} />
                )}
                {rightPanelTab === 'charts' && (
                    <ChartsTab planes={planes} sets={sets} />
                )}
                {rightPanelTab === 'summary' && <StabilitySummary />}
            </div>
        </div>
    );
}


function StatBox({ label, value, color }) {
    return (
        <div style={{
            background: 'var(--bg-tertiary)', borderRadius: 8,
            padding: '6px 4px', textAlign: 'center', flex: 1,
            border: '1px solid var(--border-color)', minWidth: 0
        }}>
            <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
        </div>
    );
}


/* ===================================================================
 *  PIPELINE TAB — Shows all 4 analysis phases + download actions
 * =================================================================== */
function PipelineTab({ scanId }) {
    const { asmResult, analysisResult } = useStore();
    const result = asmResult || analysisResult;
    const [downloading, setDownloading] = useState(null);

    const handleDownload = async (type) => {
        if (!scanId) return;
        setDownloading(type);
        try {
            switch (type) {
                case 'report_pdf':
                    await downloadReport(scanId);
                    break;
                // Add more cases if needed
            }
        } catch (e) {
            console.warn(`Download failed:`, e.message);
        } finally {
            setDownloading(null);
        }
    };

    const planesCount = asmResult?.planes_detected ?? analysisResult?.num_planes ?? 0;
    const setsCount = asmResult?.joint_sets?.length ?? analysisResult?.num_sets ?? 0;
    const insightsCount = analysisResult?.insights?.length ?? 0;

    const phases = [
        {
            id: 1, 
            name: 'Point Cloud Loading & Preprocessing',
            icon: Database,
            color: '#3b82f6',
            detail: result?.point_cloud_data 
                ? `${result.point_cloud_data.num_points?.toLocaleString()} points processed`
                : (asmResult?.point_count_processed ? `${asmResult.point_count_processed.toLocaleString()} points processed` : 'Completed'),
            status: 'completed',
        },
        {
            id: 2, 
            name: 'Plane Detection (RANSAC)',
            icon: Crosshair,
            color: '#f59e0b',
            detail: `${planesCount} planes detected`,
            status: 'completed',
        },
        {
            id: 3, 
            name: 'Orientation & Set Clustering',
            icon: Layers,
            color: '#22c55e',
            detail: `${setsCount} discontinuity sets`,
            status: 'completed',
        },
        {
            id: 4, 
            name: 'Insights & Export Generation',
            icon: Lightbulb,
            color: '#a855f7',
            detail: `${insightsCount} insights generated`,
            status: 'completed',
        },
    ];

    return (
        <div style={{ padding: 12 }}>
            {/* Pipeline Phase Tracker */}
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Analysis Pipeline — 4 Phases
                </div>
                {phases.map((phase, idx) => (
                    <div key={phase.id} style={{ display: 'flex', gap: 10, marginBottom: idx < phases.length - 1 ? 0 : 0 }}>
                        {/* Vertical connector line */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24 }}>
                            <div style={{
                                width: 24, height: 24, borderRadius: '50%',
                                background: `${phase.color}22`, border: `2px solid ${phase.color}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                <CheckCircle2 size={12} color={phase.color} />
                            </div>
                            {idx < phases.length - 1 && (
                                <div style={{ width: 2, flex: 1, minHeight: 14, background: 'var(--border-color)' }} />
                            )}
                        </div>
                        {/* Phase info */}
                        <div style={{ flex: 1, paddingBottom: idx < phases.length - 1 ? 10 : 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                                {phase.name}
                            </div>
                            <div style={{ fontSize: 10, color: phase.color, fontWeight: 600 }}>
                                {phase.detail}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Processing Summary */}
            <div className="glass-card" style={{ padding: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                    Processing Summary
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <SummaryItem label="Total Time" value={`${result?.processing_time?.toFixed(1) ?? '—'}s`} />
                    <SummaryItem label="Planes" value={planesCount} />
                    <SummaryItem label="Sets" value={setsCount} />
                    <SummaryItem label="Insights" value={insightsCount} />
                </div>
            </div>

            {/* Backend Stereonet Image (Phase 4 output) */}
            {analysisResult?.stereonet_b64 && (
                <div className="glass-card" style={{ padding: 12, marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                        Stereonet (Schmidt Projection)
                    </div>
                    <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                        <img
                            src={`data:image/png;base64,${analysisResult.stereonet_b64}`}
                            alt="Schmidt Equal-Area Stereonet"
                            style={{ width: '100%', height: 'auto', display: 'block', background: '#fff' }}
                        />
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4, textAlign: 'center' }}>
                        Generated by mplstereonet — Lower Hemisphere Equal-Area
                    </div>
                </div>
            )}

            {/* Export Phase Outputs */}
            <div className="glass-card" style={{ padding: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                    Export Phase Outputs
                </div>
                <button
                    onClick={() => handleDownload('report_pdf')}
                    disabled={downloading === 'report_pdf'}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        width: '100%', padding: '10px 12px',
                        background: 'rgba(99, 102, 241, 0.1)',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        borderRadius: 8, cursor: 'pointer',
                        color: 'var(--text-primary)', textAlign: 'left',
                        marginBottom: 8, transition: 'all 0.2s',
                    }}
                >
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(99, 102, 241, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {downloading === 'report_pdf' ? <Activity size={16} color="#6366f1" className="animate-spin" /> : <Download size={16} color="#6366f1" />}
                    </div>
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>Download Geotechnical Report</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Full PDF — ready for engineering review</div>
                    </div>
                </button>
            </div>
        </div>
    );
}

function SummaryItem({ label, value }) {
    return (
        <div style={{
            background: 'var(--bg-primary)', borderRadius: 6, padding: '6px 10px',
        }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
        </div>
    );
}

/* ===================================================================
 *  PLANES TAB
 * =================================================================== */
function PlanesTab({ planes, selectedId, onSelect }) {
    const [sortBy, setSortBy] = useState('id');
    const [sortDir, setSortDir] = useState('asc');

    const sorted = useMemo(() => {
        if (!planes) return [];
        return [...planes].sort((a, b) => {
            const va = a[sortBy] ?? 0;
            const vb = b[sortBy] ?? 0;
            return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
        });
    }, [planes, sortBy, sortDir]);

    const toggleSort = (col) => {
        if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortBy(col); setSortDir('asc'); }
    };

    const renderSortIcon = (col) => {
        if (sortBy !== col) return null;
        return sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />;
    };

    return (
        <div style={{ overflow: 'auto' }}>
            <table className="data-table">
                <thead>
                    <tr>
                        <th onClick={() => toggleSort('id')} style={{ cursor: 'pointer' }}>
                            ID {renderSortIcon('id')}
                        </th>
                        <th onClick={() => toggleSort('set_id')} style={{ cursor: 'pointer' }}>
                            Set {renderSortIcon('set_id')}
                        </th>
                        <th onClick={() => toggleSort('dip')} style={{ cursor: 'pointer' }}>
                            Dip {renderSortIcon('dip')}
                        </th>
                        <th onClick={() => toggleSort('dip_direction')} style={{ cursor: 'pointer' }}>
                            Dip Dir {renderSortIcon('dip_direction')}
                        </th>
                        <th onClick={() => toggleSort('strike')} style={{ cursor: 'pointer' }}>
                            Strike {renderSortIcon('strike')}
                        </th>
                        <th onClick={() => toggleSort('area')} style={{ cursor: 'pointer' }}>
                            Area {renderSortIcon('area')}
                        </th>
                        <th>Conf.</th>
                    </tr>
                </thead>
                <tbody>
                    {sorted.map(p => (
                        <tr
                            key={p.id}
                            className={selectedId === p.id ? 'selected' : ''}
                            onClick={() => onSelect(p.id)}
                        >
                            <td style={{ fontWeight: 600 }}>P{p.id}</td>
                            <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span className="color-dot" style={{ background: p.color }} />
                                    S{p.set_id + 1}
                                </div>
                            </td>
                            <td>{p.dip?.toFixed(1)}°</td>
                            <td>{p.dip_direction?.toFixed(1)}°</td>
                            <td>{p.strike?.toFixed(1)}°</td>
                            <td>{p.area?.toFixed(1)}m²</td>
                            <td>
                                <div style={{
                                    width: 30, height: 4, borderRadius: 2,
                                    background: 'var(--bg-primary)', overflow: 'hidden',
                                }}>
                                    <div style={{
                                        width: `${(p.confidence || 0) * 100}%`, height: '100%',
                                        background: p.confidence > 0.8 ? 'var(--success)' : p.confidence > 0.5 ? 'var(--warning)' : 'var(--danger)',
                                        borderRadius: 2,
                                    }} />
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Selected plane detail */}
            {selectedId !== null && selectedId !== undefined && (() => {
                const p = planes?.find(pp => pp.id === selectedId);
                if (!p) return null;
                return (
                    <div className="animate-slide-up" style={{
                        margin: 8, padding: 12, borderRadius: 10,
                        background: 'var(--bg-tertiary)', border: `1px solid ${p.color}`,
                    }}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: p.color }}>
                            Plane {p.id} Details — Set {p.set_id + 1}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
                            <Detail label="Dip" value={`${p.dip?.toFixed(2)}°`} />
                            <Detail label="Dip Direction" value={`${p.dip_direction?.toFixed(2)}°`} />
                            <Detail label="Strike" value={`${p.strike?.toFixed(2)}°`} />
                            <Detail label="Area" value={`${p.area?.toFixed(2)} m²`} />
                            <Detail label="Points" value={p.num_points?.toLocaleString()} />
                            <Detail label="Confidence" value={`${(p.confidence * 100).toFixed(1)}%`} />
                            <Detail label="Normal" value={`[${p.normal?.map(n => n.toFixed(3)).join(', ')}]`} />
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}


function Detail({ label, value }) {
    return (
        <div>
            <span style={{ color: 'var(--text-muted)' }}>{label}: </span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
        </div>
    );
}


/* ===================================================================
 *  SETS TAB — Now displays Fisher K values from Phase 3
 * =================================================================== */
function SetsTab({ sets }) {
    if (!sets?.length) return <EmptyState text="No discontinuity sets found" />;

    return (
        <div style={{ padding: 12 }}>
            {sets.map(s => (
                <div key={s.set_id} className="glass-card" style={{
                    padding: 14, marginBottom: 10,
                    borderLeft: `4px solid ${s.color}`,
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="color-dot" style={{ background: s.color, width: 14, height: 14 }} />
                            <span style={{ fontSize: 14, fontWeight: 700 }}>{s.name}</span>
                        </div>
                        <span className="badge badge-info">{s.plane_count ?? s.num_planes ?? 0} planes</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                        <OrientationBox label="Mean Dip" value={`${s.mean_dip?.toFixed(1)}°`} sub={`±${s.std_dip?.toFixed(1)}°`} />
                        <OrientationBox label="Dip Dir." value={`${s.mean_dip_direction?.toFixed(1)}°`} sub={`±${s.std_dip_direction?.toFixed(1)}°`} />
                        <OrientationBox label="Strike" value={`${s.mean_strike?.toFixed(1)}°`} />
                    </div>

                    {/* Fisher K-value display — Phase 3 integration */}
                    {s.fisher_k !== null && s.fisher_k !== undefined && (
                        <div style={{
                            marginTop: 8, padding: '8px 10px', borderRadius: 8,
                            background: getFisherKBackground(s.fisher_k_label),
                            border: `1px solid ${getFisherKBorderColor(s.fisher_k_label)}`,
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Target size={13} color={getFisherKColor(s.fisher_k_label)} />
                                <div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: getFisherKColor(s.fisher_k_label) }}>
                                        Fisher K = {s.fisher_k?.toFixed(1)}
                                    </div>
                                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                                        Concentration: {s.fisher_k_label ? s.fisher_k_label.charAt(0).toUpperCase() + s.fisher_k_label.slice(1) : 'N/A'}
                                    </div>
                                </div>
                            </div>
                            <FisherKBadge label={s.fisher_k_label} />
                        </div>
                    )}
                    {(s.fisher_k === null || s.fisher_k === undefined) && (
                        <div style={{
                            marginTop: 8, padding: '6px 10px', borderRadius: 8,
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid var(--border-color)',
                            fontSize: 9, color: 'var(--text-muted)', textAlign: 'center',
                        }}>
                            Fisher K: Insufficient planes (need ≥ 3)
                        </div>
                    )}

                    <div style={{
                        marginTop: 8, fontSize: 11, color: 'var(--text-muted)',
                        display: 'flex', justifyContent: 'space-between',
                    }}>
                        <span>Persistence: {s.persistence_m != null ? `${s.persistence_m.toFixed(2)}m` : (s.total_points ? s.total_points.toLocaleString() + ' pts' : '—')}</span>
                    </div>
                </div>
            ))}
        </div>
    );
}

/* Fisher K helpers */
function getFisherKColor(label) {
    if (label === 'strong') return '#22c55e';
    if (label === 'moderate') return '#f59e0b';
    if (label === 'dispersed') return '#ef4444';
    return 'var(--text-muted)';
}

function getFisherKBackground(label) {
    if (label === 'strong') return 'rgba(34, 197, 94, 0.08)';
    if (label === 'moderate') return 'rgba(245, 158, 11, 0.08)';
    if (label === 'dispersed') return 'rgba(239, 68, 68, 0.08)';
    return 'rgba(255,255,255,0.02)';
}

function getFisherKBorderColor(label) {
    if (label === 'strong') return 'rgba(34, 197, 94, 0.2)';
    if (label === 'moderate') return 'rgba(245, 158, 11, 0.2)';
    if (label === 'dispersed') return 'rgba(239, 68, 68, 0.2)';
    return 'var(--border-color)';
}

function FisherKBadge({ label }) {
    const color = getFisherKColor(label);
    const text = label ? label.toUpperCase() : 'N/A';
    return (
        <span style={{
            fontSize: 8, fontWeight: 800, color: color,
            padding: '2px 6px', borderRadius: 4,
            background: `${color}22`, letterSpacing: 0.5,
        }}>
            {text}
        </span>
    );
}


function OrientationBox({ label, value, sub }) {
    return (
        <div style={{
            background: 'var(--bg-primary)', borderRadius: 6, padding: '6px 8px',
            textAlign: 'center',
        }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
            {sub && <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{sub}</div>}
        </div>
    );
}


function InsightsTab({ insights }) {
    if (!insights?.length) return <EmptyState text="No structural insights available" />;

    const severityOrder = { high: 0, medium: 1, low: 2 };
    const sorted = [...(insights || [])].sort((a, b) =>
        (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3)
    );

    const categoryIcon = (cat) => {
        switch (cat) {
            case 'risk': return <AlertTriangle size={14} color="var(--danger)" />;
            case 'safety': return <Shield size={14} color="var(--warning)" />;
            case 'optimization': return <TrendingUp size={14} color="var(--info)" />;
            default: return <Lightbulb size={14} color="var(--text-muted)" />;
        }
    };

    const severityBadge = (sev) => {
        const cls = sev === 'high' ? 'badge-danger' : sev === 'medium' ? 'badge-warning' : 'badge-info';
        return <span className={`badge ${cls}`}>{sev}</span>;
    };

    return (
        <div style={{ padding: 12 }}>
            {/* Summary */}
            <div style={{
                display: 'flex', gap: 8, marginBottom: 12,
            }}>
                <MiniStat
                    icon={<AlertTriangle size={12} />}
                    label="Risks"
                    value={insights.filter(i => i.category === 'risk').length}
                    color="var(--danger)"
                />
                <MiniStat
                    icon={<Shield size={12} />}
                    label="Safety"
                    value={insights.filter(i => i.category === 'safety').length}
                    color="var(--warning)"
                />
                <MiniStat
                    icon={<TrendingUp size={12} />}
                    label="Optimize"
                    value={insights.filter(i => i.category === 'optimization').length}
                    color="var(--info)"
                />
            </div>

            {sorted.map((insight, i) => (
                <div
                    key={i}
                    className={`insight-card ${insight.category}`}
                    style={{ animationDelay: `${i * 80}ms` }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {categoryIcon(insight.category)}
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                                {insight.title}
                            </span>
                        </div>
                        {severityBadge(insight.severity)}
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>
                        {insight.description}
                    </p>
                    <div style={{
                        fontSize: 11, color: 'var(--accent-primary)', fontWeight: 500,
                        background: 'rgba(245, 158, 11, 0.08)', padding: '6px 10px',
                        borderRadius: 6, lineHeight: 1.5,
                    }}>
                        <Zap size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                        {insight.recommendation}
                    </div>
                    {insight.related_sets?.length > 0 && (
                        <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
                            {insight.related_sets.map(s => (
                                <span key={s} style={{
                                    fontSize: 9, padding: '2px 6px', borderRadius: 4,
                                    background: 'var(--bg-primary)', color: 'var(--text-muted)',
                                    border: '1px solid var(--border-color)',
                                }}>
                                    Set {s + 1}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

function MiniStat({ icon, label, value, color }) {
    return (
        <div style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 8,
            border: '1px solid var(--border-color)',
        }}>
            <span style={{ color }}>{icon}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color }}>{value}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</span>
        </div>
    );
}

function ChartsTab({ planes, sets }) {
    return <Charts planes={planes} sets={sets} />;
}

function EmptyState({ text }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 200, color: 'var(--text-muted)', fontSize: 13,
        }}>
            {text}
        </div>
    );
}
