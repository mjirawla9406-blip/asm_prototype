'use client';

import { useState, useMemo } from 'react';
import {
    Table, BarChart3, AlertTriangle, Lightbulb,
    TrendingUp, ChevronDown, ChevronUp, Shield,
    Target, Zap, ChevronRight, ChevronLeft, Layers
} from 'lucide-react';
import useStore from '@/store/useStore';
import dynamic from 'next/dynamic';

// Dynamically import charts (avoid SSR issues with Chart.js)
const Charts = dynamic(() => import('./Charts'), { ssr: false });

export default function StructuralDashboard() {
    const {
        analysisResult, rightPanelTab, setRightPanelTab,
        selectedPlaneId, setSelectedPlaneId, visibleSets,
        dashboardCollapsed, setDashboardCollapsed
    } = useStore();

    if (!analysisResult) return null;

    const { planes = [], sets = [], insights = [], processing_time = 0 } = analysisResult || {};

    const tabs = [
        { id: 'planes', label: 'Planes', icon: Table, count: planes.length },
        { id: 'sets', label: 'Sets', icon: Layers, count: sets.length },
        { id: 'insights', label: 'Insights', icon: Lightbulb, count: insights.length },
        { id: 'charts', label: 'Charts', icon: BarChart3 },
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
            </div>
        </div>
    );
}


function Layers2Icon(props) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" {...props} width={props.size} height={props.size}>
            <path d="m12 2 10 6.5-10 6.5L2 8.5z" /><path d="m2 15.5 10 6.5 10-6.5" />
        </svg>
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

    const SortIcon = ({ col }) => {
        if (sortBy !== col) return null;
        return sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />;
    };

    return (
        <div style={{ overflow: 'auto' }}>
            <table className="data-table">
                <thead>
                    <tr>
                        <th onClick={() => toggleSort('id')} style={{ cursor: 'pointer' }}>
                            ID <SortIcon col="id" />
                        </th>
                        <th onClick={() => toggleSort('set_id')} style={{ cursor: 'pointer' }}>
                            Set <SortIcon col="set_id" />
                        </th>
                        <th onClick={() => toggleSort('dip')} style={{ cursor: 'pointer' }}>
                            Dip <SortIcon col="dip" />
                        </th>
                        <th onClick={() => toggleSort('dip_direction')} style={{ cursor: 'pointer' }}>
                            Dip Dir <SortIcon col="dip_direction" />
                        </th>
                        <th onClick={() => toggleSort('strike')} style={{ cursor: 'pointer' }}>
                            Strike <SortIcon col="strike" />
                        </th>
                        <th onClick={() => toggleSort('area')} style={{ cursor: 'pointer' }}>
                            Area <SortIcon col="area" />
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
                        <span className="badge badge-info">{s.num_planes} planes</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                        <OrientationBox label="Mean Dip" value={`${s.mean_dip?.toFixed(1)}°`} sub={`±${s.std_dip?.toFixed(1)}°`} />
                        <OrientationBox label="Dip Dir." value={`${s.mean_dip_direction?.toFixed(1)}°`} sub={`±${s.std_dip_direction?.toFixed(1)}°`} />
                        <OrientationBox label="Strike" value={`${s.mean_strike?.toFixed(1)}°`} />
                    </div>

                    <div style={{
                        marginTop: 8, fontSize: 11, color: 'var(--text-muted)',
                        display: 'flex', justifyContent: 'space-between',
                    }}>
                        <span>Total points: {s.total_points?.toLocaleString()}</span>
                    </div>
                </div>
            ))}
        </div>
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
