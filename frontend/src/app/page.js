'use client';

import {
  Bell, User, ChevronDown, Search, Filter,
  Upload, Download, Plus, ChevronLeft, ChevronRight
} from 'lucide-react';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import useStore from '@/store/useStore';
import ScanLibrary from '@/components/scans/ScanLibrary';
import PointCloudViewer from '@/components/viewer/PointCloudViewer';
import dynamic from 'next/dynamic';

import {
  listScans, uploadScan, deleteScan,
  startAnalysis, getAnalysisStatus, getAnalysisResult,
  getPointCloudData, importLocalScan
} from '@/lib/api';
const StructuralDashboard = dynamic(() => import('@/components/analysis/StructuralDashboard'), { ssr: false });
const DensityPlot = dynamic(() => import('@/components/analysis/DensityPlot'), { ssr: false });
const StereonetPlot = dynamic(() => import('@/components/analysis/StereonetPlot'), { ssr: false });
const SetSubViews = dynamic(() => import('@/components/analysis/SetSubViews'), { ssr: false });
const StabilitySummary = dynamic(() => import('@/components/analysis/StabilitySummary'), { ssr: false });

export default function Home() {
  const { 
    scans, analysisResult, showScanLibrary, 
    setTriggerUpload, setScans, setScanLoading 
  } = useStore();
  const setSelectedScanId = useStore(state => state.setSelectedScanId);
  const selectedScanId = useStore(state => state.selectedScanId);

  const totalScans = scans.length;
  const totalBytes = scans.reduce((acc, s) => {
    // file_size is already a float in MB from the backend
    return acc + (s.file_size || 0) * 1024 * 1024;
  }, 0);

  const formatVolume = (bytes) => {
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Auto-select first scan when list loads
  useEffect(() => {
    if (scans && scans.length > 0 && !selectedScanId) {
      console.log('Auto-selecting first scan:', scans[0].scan_id);
      setSelectedScanId(scans[0].scan_id);
    }
  }, [scans, selectedScanId, setSelectedScanId]);

  const handleLocalImport = async () => {
    console.log('Import button clicked');
    const filePath = window.prompt("Enter the absolute file path to the LAS/LAZ file:\n(e.g., C:\\Scans\\Vithalapura.las)");
    if (!filePath) return;
    
    const scanName = window.prompt("Enter a name for this scan:", filePath.split('\\').pop().split('/').pop());
    if (!scanName) return;

    try {
      setScanLoading(true);
      const result = await importLocalScan(filePath, scanName);
      
      // Refresh scans
      const data = await listScans();
      setScans(data.scans || []);
      
      if (result.status === 'success' && result.scan_id) {
        setSelectedScanId(result.scan_id);
        await startAnalysis(result.scan_id);
        alert(`Success! "${scanName}" has been imported and analysis has started.`);
      } else {
        alert("Import completed, but returned an unexpected status.");
      }
    } catch (err) {
      console.error(err);
      alert("⚠️ Import Failed\n\nPlease ensure the file path is correct and accessible by the backend server.");
    } finally {
      setScanLoading(false);
    }
  };

  const handleFileUpload = async (event) => {
    console.log('File upload initiated');
    const file = event.target.files[0];
    if (!file) return;

    try {
      setScanLoading(true);
      const scanName = file.name.replace(/\.[^/.]+$/, "");
      const uploadRes = await uploadScan(file, scanName);
      
      const data = await listScans();
      const loadedScans = data.scans || [];
      setScans(loadedScans);
      
      // Auto-select and Auto-Analyze
      if (uploadRes && uploadRes.scan_id) {
        setSelectedScanId(uploadRes.scan_id);
        // We'll let the ScanLibrary component handle the polling since it's already mounted 
        // and has the analysis UI. But we trigger the start here.
        await startAnalysis(uploadRes.scan_id);
      }
      
      alert(`Success! "${file.name}" has been uploaded and analysis has started.`);
    } catch (err) {
      console.error(err);
      alert("Upload failed: " + err.message);
    } finally {
      setScanLoading(false);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      minHeight: '100vh', 
      background: '#0a0d11', 
      color: '#fff' 
    }}>
      {/* Hidden inputs for file actions */}
      <input 
        id="main-file-upload"
        type="file" 
        style={{ display: 'none' }} 
        onChange={handleFileUpload}
        accept=".las,.laz"
      />
      {/* 1. Global Header */}
      <header style={{
        height: 54, background: 'var(--bg-secondary)', borderBottom: '1px solid #2a2f3a',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', flexShrink: 0,
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent-primary)', margin: 0 }}>UG Drone Digital Twin™</h2>
          <p style={{ fontSize: 9, color: 'var(--text-muted)', margin: 0 }}>Underground Drone Platform</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ position: 'relative', cursor: 'pointer' }}>
            <Bell size={18} color="var(--text-secondary)" />
            <span style={{ position: 'absolute', top: -2, right: -2, width: 7, height: 7, background: '#ef4444', borderRadius: '50%', border: '2px solid var(--bg-secondary)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <User size={20} color="#000" />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Bhana Ram Choudhary</span>
            <ChevronDown size={12} color="var(--text-muted)" />
          </div>
        </div>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', padding: '12px 20px', maxWidth: 1400, margin: '0 auto', width: '100%', minWidth: 1200 }}>
        {/* 2. Page Title Area */}
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 2, letterSpacing: '-0.02em' }}>Automated structural mapping</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 800, lineHeight: 1.4 }}>Advanced structural analysis and automated discontinuity characterization for underground mining operations.</p>
        </div>

        {/* 3. Stats Cards */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid #2a2f3a', borderRadius: 10, padding: '12px 20px', maxWidth: 280 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent-primary)', marginBottom: 1 }}>{totalScans}</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Scans Registered</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid #2a2f3a', borderRadius: 10, padding: '12px 20px', maxWidth: 280 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent-primary)', marginBottom: 1 }}>{formatVolume(totalBytes)}</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Data Volume</div>
          </div>
        </div>

        {/* 4. Action Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              type="text" placeholder="Search scans..." 
              style={{ width: '100%', height: 36, background: 'rgba(255,255,255,0.02)', border: '1px solid #2a2f3a', borderRadius: 8, padding: '0 10px 0 38px', color: '#fff', fontSize: 13 }} 
            />
          </div>
          <button className="btn-secondary" style={{ height: 36, padding: '0 12px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <Filter size={14} /> Filters
          </button>
          <button 
            className="btn-secondary" 
            onClick={handleLocalImport}
            style={{ height: 36, padding: '0 12px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
          >
            <Upload size={14} /> Import
          </button>
          <button className="btn-secondary" style={{ height: 36, padding: '0 12px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <Download size={14} /> Export
          </button>
          <button 
            className="btn-primary" 
            onClick={() => {
              console.log('New Scan button clicked');
              document.getElementById('main-file-upload').click();
            }}
            style={{ height: 36, padding: '0 16px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
          >
            <Plus size={16} /> New Scan
          </button>
        </div>

        {/* 5. Main Content Area */}
        <div style={{ display: 'flex', gap: showScanLibrary ? 20 : 0, marginBottom: 30, position: 'relative' }}>
          {/* Scan Library Panel */}
          <div style={{ 
            width: showScanLibrary ? 320 : 0, 
            opacity: showScanLibrary ? 1 : 0,
            overflow: 'hidden',
            transition: 'all 0.3s ease-in-out',
            flexShrink: 0,
            maxHeight: 500,
            height: 500,
            display: 'flex',
            flexDirection: 'column'
          }}>
            <ScanLibrary />
          </div>

          {/* Collapse Toggle Handle */}
          <button 
            onClick={() => useStore.getState().setShowScanLibrary(!showScanLibrary)}
            style={{
                position: 'absolute',
                left: showScanLibrary ? 308 : -8,
                top: 12,
                zIndex: 110,
                width: 18,
                height: 36,
                background: '#2a2f3a',
                border: '1px solid #3f444e',
                borderRadius: '5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--accent-primary)',
                transition: 'all 0.2s',
                boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
            }}
          >
            {showScanLibrary ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
          </button>

          {/* 3D Viewer Panel */}
          <div style={{ 
            flex: 1, 
            minWidth: 0, 
            display: 'flex', 
            flexDirection: 'column', 
            background: 'var(--bg-secondary)', 
            borderRadius: 16, 
            border: '1px solid #2a2f3a', 
            overflow: 'hidden', 
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            height: 500, // Increased to fill space as requested
            border: '1px solid var(--accent-primary)', 
          }}>
            <PointCloudViewer />
          </div>
        </div>

        {/* 6. Analysis Section — shown below the viewer after analysis completes */}
        {analysisResult && (
          <div style={{ marginBottom: 60 }}>
            {/* Section header */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 2 }}>Structural Analysis Results</h2>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Detailed discontinuity characterization and kinematic stability assessment</p>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.03)', padding: '4px 10px', borderRadius: 6, border: '1px solid #2a2f3a' }}>
                   ID: {selectedScanId} | Computed in {analysisResult.processing_time}s
                </div>
              </div>
            </div>

            {/* Row 1: Dashboard + Primary Plots */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 20 }}>

              {/* Left: Structural Dashboard — increased height to match grid better */}
              <div style={{
                width: 400, minWidth: 400, height: 500, flexShrink: 0,
                background: 'var(--bg-secondary)', borderRadius: 12,
                border: '1px solid #2a2f3a', overflowY: 'auto',
                boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                scrollbarWidth: 'thin',
                border: '1px solid rgba(59, 130, 246, 0.2)'
              }}>
                <StructuralDashboard />
              </div>

              {/* Right: 2-column analysis grid */}
              <div style={{
                flex: 1, minWidth: 0,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12
              }}>
                {/* Density Plot */}
                <div style={{
                  height: 300, position: 'relative',
                  background: 'var(--bg-secondary)', borderRadius: 12,
                  border: '1px solid #2a2f3a', overflow: 'hidden',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.25)'
                }}>
                  <DensityPlot />
                </div>

                {/* Stereonet Plot */}
                <div style={{
                  height: 300, position: 'relative',
                  background: 'var(--bg-secondary)', borderRadius: 12,
                  border: '1px solid #2a2f3a', overflow: 'hidden',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.25)'
                }}>
                  <StereonetPlot />
                </div>

                {/* Set Sub-Views */}
                <div style={{
                  height: 188, position: 'relative',
                  gridColumn: '1 / -1',
                  background: 'var(--bg-secondary)', borderRadius: 12,
                  border: '1px solid #2a2f3a', overflow: 'hidden',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.25)'
                }}>
                  <SetSubViews />
                </div>
              </div>
            </div>

            {/* Row 2: Advanced Stability & Mining Intelligence (Fills the big gap) */}
            <StabilitySummary />

          </div>
        )}

      </div>
    </div>
  );
}


