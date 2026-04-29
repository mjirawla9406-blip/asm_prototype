'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import useStore from '@/store/useStore';
import {
  RotateCcw, Eye, EyeOff, Box, Camera, Grid3X3, Settings,
  Maximize2, LayoutList as List, Ruler, Scissors, Wind,
  Layers, Tag, ArrowUpRight
} from 'lucide-react';

const POTREE_VIEWER_URL = '/potree-viewer/index.html';

// ─── Toolbar Button Component ───────────────────────────────────────────────
function TBtn({ icon: Icon, label, onClick, active, disabled, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 3, padding: '6px 10px', borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
        border: `1px solid ${active ? 'rgba(59,130,246,0.6)' : 'rgba(255,255,255,0.06)'}`,
        background: active ? 'rgba(59,130,246,0.18)' : 'transparent',
        color: active ? '#60a5fa' : disabled ? 'rgba(148,163,184,0.35)' : '#94a3b8',
        fontSize: 10, fontFamily: 'Inter, sans-serif', transition: 'all 0.18s',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Icon size={15} />
      {label}
    </button>
  );
}

function TSep() {
  return <div style={{ width: 1, height: 26, background: 'rgba(255,255,255,0.06)', margin: '0 2px' }} />;
}

export default function PointCloudViewer() {
  const {
    pointCloudLoading, pointCloudData,
    asmResult, analysisResult,
    visibleSets, showPlanes, showNormals, showLabels,
    pointSize, setPointSize,
    viewMode, setViewMode,
    layoutMode, setLayoutMode,
    setShowPlanes, setShowNormals, setShowLabels,
    potreeOrigin, autoRotate,
    currentScanId,
  } = useStore();

  const setPotreeOrigin = useCallback((o) => useStore.getState().setPotreeOrigin(o), []);
  const setAutoRotate   = useCallback((v) => useStore.getState().setAutoRotate(v), []);

  const [showControls, setShowControls] = useState(false);
  const [activeTool,   setActiveTool]   = useState(null); // 'ruler' | 'clip' | null
  const containerRef = useRef(null);
  const iframeRef    = useRef(null);

  const activeResult = asmResult || analysisResult;
  const planes       = activeResult?.planes || [];
  const sets         = asmResult?.joint_sets || analysisResult?.sets || [];
  const setsCount    = asmResult?.joint_sets?.length ?? analysisResult?.num_sets ?? 0;
  const hasResult    = !!activeResult && planes.length > 0;

  // ── postMessage helper ────────────────────────────────────────────────────
  const sendToViewer = useCallback((type, payload = {}) => {
    try {
      iframeRef.current?.contentWindow?.postMessage({ type, payload }, '*');
    } catch (e) {
      console.warn('[ViewerBridge] postMessage failed:', e);
    }
  }, []);

  // ── Load LAS when scan selected ───────────────────────────────────────────
  useEffect(() => {
    if (!currentScanId || !iframeRef.current) return;

    const url = `http://localhost:8000/api/scans/${currentScanId}/file`;
    let handshakeInterval;
    let isLoaded = false;

    const onMessage = (e) => {
      if (e.data?.type === 'PONG' || e.data?.type === 'VIEWER_READY') {
        if (!isLoaded) {
          sendToViewer('LOAD_URL', { url });
          isLoaded = true;
          clearInterval(handshakeInterval);
        }
      }
    };

    window.addEventListener('message', onMessage);
    handshakeInterval = setInterval(() => { if (!isLoaded) sendToViewer('PING'); }, 500);
    const timer = setTimeout(() => { if (!isLoaded) sendToViewer('LOAD_URL', { url }); }, 2000);

    return () => {
      clearInterval(handshakeInterval);
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
    };
  }, [currentScanId, sendToViewer]);

  // ── Capture FILE_LOADED (cx, cy, cz) from Potree ─────────────────────────
  useEffect(() => {
    const onMessage = (e) => {
      if (e.data?.type === 'FILE_LOADED' && e.data?.payload) {
        setPotreeOrigin(e.data.payload);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [setPotreeOrigin]);

  // ── Send APPLY_PLANES when both analysis result + potreeOrigin are ready ──
  useEffect(() => {
    if (!activeResult || !potreeOrigin) {
      sendToViewer('CLEAR_PLANES');
      return;
    }
    if (planes.length === 0) return;

    const pcd = activeResult?.point_cloud_data;
    if (!pcd?.centroid || !pcd?.scale) return;

    sendToViewer('APPLY_PLANES', {
      planes: planes.map(p => ({
        centroid:      p.centroid,
        normal:        p.normal,
        area:          p.area,
        color:         p.color,
        set_id:        p.set_id,
        dip:           p.dip,
        dip_direction: p.dip_direction,
      })),
      viz_centroid:  pcd.centroid,
      backend_scale: pcd.scale,
      cx: potreeOrigin.cx,
      cy: potreeOrigin.cy,
      cz: potreeOrigin.cz,
      set_color_map: null,
    });
  }, [activeResult, planes, potreeOrigin, sendToViewer]);

  // ── Sync showPlanes ───────────────────────────────────────────────────────
  useEffect(() => {
    sendToViewer('SET_SHOW_PLANES', { visible: showPlanes });
  }, [showPlanes, sendToViewer]);

  // ── Sync showNormals ──────────────────────────────────────────────────────
  useEffect(() => {
    sendToViewer('SET_SHOW_NORMALS', { visible: showNormals });
  }, [showNormals, sendToViewer]);

  // ── Sync showLabels ───────────────────────────────────────────────────────
  useEffect(() => {
    sendToViewer('SET_SHOW_LABELS', { visible: showLabels });
  }, [showLabels, sendToViewer]);

  // ── Sync visibleSets → Potree plane visibility ────────────────────────────
  useEffect(() => {
    sendToViewer('SET_VISIBLE_SETS', { visibleSetIds: Array.from(visibleSets) });
  }, [visibleSets, sendToViewer]);

  // ── Sync viewMode → color mode + plane visibility ─────────────────────────
  useEffect(() => {
    const mode = viewMode === 'original' ? 'rgb' : 'elev';
    sendToViewer('SET_COLOR_MODE', { mode });
    if (viewMode === 'original') {
      sendToViewer('SET_SHOW_PLANES', { visible: false });
    } else {
      sendToViewer('SET_SHOW_PLANES', { visible: showPlanes });
      sendToViewer('SET_VISIBLE_SETS', { visibleSetIds: Array.from(visibleSets) });
    }
  }, [viewMode, showPlanes, visibleSets, sendToViewer]);

  // ── Sync point size ───────────────────────────────────────────────────────
  useEffect(() => {
    sendToViewer('SET_POINT_SIZE', { size: pointSize * 30 });
  }, [pointSize, sendToViewer]);

  // ── EDL default on ───────────────────────────────────────────────────────
  useEffect(() => {
    sendToViewer('SET_EDL', { enabled: true });
  }, [sendToViewer]);

  // ── Sync autoRotate ───────────────────────────────────────────────────────
  useEffect(() => {
    sendToViewer('SET_AUTO_ROTATE', { enabled: autoRotate });
  }, [autoRotate, sendToViewer]);

  // ── Sync viz points for set coloring (Overlay mode) ──────────────────────
  useEffect(() => {
    if (viewMode === 'analyzed' && activeResult?.point_cloud_data) {
      console.log('[ViewerBridge] Loading viz points overlay for analyzed view');
      sendToViewer('LOAD_VIZ_POINTS', {
        positions: activeResult.point_cloud_data.positions,
        colors: activeResult.point_cloud_data.set_colors,
      });
    } else {
      sendToViewer('CLEAR_VIZ_POINTS');
    }
  }, [viewMode, activeResult, sendToViewer]);

  // ── Utilities ─────────────────────────────────────────────────────────────
  const takeScreenshot = useCallback(() => {
    try {
      const canvas = iframeRef.current?.contentDocument?.querySelector('canvas');
      if (canvas) {
        const a = document.createElement('a');
        a.download = `mine-scan-${Date.now()}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
      }
    } catch (e) { console.warn('Screenshot failed (cross-origin?):', e); }
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    !document.fullscreenElement
      ? el.requestFullscreen().catch(console.error)
      : document.exitFullscreen();
  }, []);

  const handleToolToggle = useCallback((tool) => {
    if (activeTool === tool) {
      // Deactivate
      setActiveTool(null);
      sendToViewer('MEASURE', { tool: 'CLEAR' });
      sendToViewer('CLIP',    { action: 'CLEAR' });
    } else {
      setActiveTool(tool);
      if (tool === 'ruler') {
        sendToViewer('MEASURE', { tool: 'DISTANCE' });
      } else if (tool === 'clip') {
        sendToViewer('CLIP', { action: 'ADD_BOX' });
        sendToViewer('CLIP', { mode: 'CLIP_INSIDE' });
      }
    }
  }, [activeTool, sendToViewer]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const renderMain3D = () => (
    <div style={{ flex: 1, position: 'relative', height: '100%', minHeight: 0 }}>

      {/* Loading overlay */}
      {pointCloudLoading && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 20, flexDirection: 'column', gap: 12 }}>
          <div style={{ width: 40, height: 40, border: '3px solid var(--border-color)',
            borderTopColor: 'var(--accent-primary)', borderRadius: '50%',
            animation: 'spin-slow 1s linear infinite' }} />
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading point cloud…</div>
        </div>
      )}

      {/* Empty state */}
      {!currentScanId && !pointCloudLoading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexDirection: 'column', gap: 20,
          zIndex: 10, background: '#0b0f1a' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(59,130,246,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(59,130,246,0.2)' }}>
            <Box size={32} color="var(--accent-primary)" style={{ opacity: 0.8 }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px 0', color: '#fff' }}>No Scan Selected</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, opacity: 0.7 }}>
              Select a scan from the library on the left
            </p>
          </div>
        </div>
      )}

      {/* Potree iframe */}
      <iframe
        ref={iframeRef}
        src={POTREE_VIEWER_URL}
        title="Potree Engine"
        style={{ width: '100%', height: '100%', border: 'none', display: 'block', background: '#0a0e17' }}
        allow="fullscreen"
      />

      {/* ── Point count badge ── */}
      {pointCloudData && (
        <div style={{ position: 'absolute', bottom: 12, left: 12,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          padding: '5px 12px', borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.07)',
          fontSize: 11, color: 'var(--text-secondary)',
          display: 'flex', gap: 12, alignItems: 'center',
          pointerEvents: 'none' }}>
          <span><strong style={{ color: 'var(--accent-primary)' }}>
            {pointCloudData.num_points?.toLocaleString()}
          </strong> pts</span>
          {planes.length > 0 && (
            <span style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: 12 }}>
              <strong style={{ color: '#60a5fa' }}>{planes.length}</strong> planes
            </span>
          )}
          {setsCount > 0 && (
            <span style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: 12 }}>
              <strong style={{ color: '#10b981' }}>{setsCount}</strong> sets
            </span>
          )}
        </div>
      )}
    </div>
  );

  // ── Toolbar ───────────────────────────────────────────────────────────────
  const renderToolbar = () => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 2,
      padding: '5px 10px',
      background: 'rgba(10,14,23,0.95)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      flexShrink: 0, flexWrap: 'wrap',
    }}>
      {/* Before / After toggle */}
      <div style={{ display: 'flex', borderRadius: 7, overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)', marginRight: 4 }}>
        {['original', 'analyzed'].map((m) => (
          <button key={m}
            onClick={() => setViewMode(m)}
            style={{
              padding: '4px 12px', fontSize: 11, cursor: 'pointer',
              background: viewMode === m ? 'rgba(59,130,246,0.25)' : 'transparent',
              color: viewMode === m ? '#60a5fa' : '#94a3b8',
              border: 'none', fontFamily: 'Inter, sans-serif',
              borderRight: m === 'original' ? '1px solid rgba(255,255,255,0.06)' : 'none',
              transition: 'all 0.15s',
            }}>
            {m === 'original' ? 'Before' : 'After'}
          </button>
        ))}
      </div>

      <TSep />

      {/* Reset view */}
      <TBtn icon={RotateCcw} label="Reset"
        onClick={() => sendToViewer('RESET_VIEW')} />

      {/* Auto-rotate */}
      <TBtn icon={Wind} label="Spin"
        active={autoRotate}
        onClick={() => setAutoRotate(!autoRotate)} />

      <TSep />

      {/* Plane overlays toggle — only when analysis result exists */}
      <TBtn icon={Layers} label="Planes"
        active={showPlanes && hasResult}
        disabled={!hasResult}
        onClick={() => setShowPlanes(!showPlanes)} />

      {/* Normals toggle */}
      <TBtn icon={ArrowUpRight} label="Normals"
        active={showNormals && hasResult}
        disabled={!hasResult}
        onClick={() => setShowNormals(!showNormals)} />

      {/* Labels toggle */}
      <TBtn icon={Tag} label="Labels"
        active={showLabels && hasResult}
        disabled={!hasResult}
        onClick={() => setShowLabels(!showLabels)} />

      <TSep />

      {/* Ruler */}
      <TBtn icon={Ruler} label="Ruler"
        active={activeTool === 'ruler'}
        onClick={() => handleToolToggle('ruler')} />

      {/* Clip box */}
      <TBtn icon={Scissors} label="Clip"
        active={activeTool === 'clip'}
        onClick={() => handleToolToggle('clip')} />

      <TSep />

      {/* Multi-panel toggle */}
      <TBtn icon={Grid3X3} label="Multi"
        active={layoutMode === 'multi'}
        onClick={() => setLayoutMode(layoutMode === 'multi' ? 'single' : 'multi')} />

      {/* Controls panel */}
      <TBtn icon={Settings} label="Controls"
        active={showControls}
        onClick={() => setShowControls(v => !v)} />

      {/* Screenshot */}
      <TBtn icon={Camera} label="Screenshot"
        onClick={takeScreenshot} />

      {/* Fullscreen */}
      <TBtn icon={Maximize2} label="Fullscreen"
        onClick={toggleFullscreen} />
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
      background: '#0d1117', position: 'relative', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
        {renderToolbar()}
        <div style={{ flex: 1, position: 'relative', display: 'flex', minHeight: 0 }}>
          {renderMain3D()}
        </div>
      </div>
    </div>
  );
}
