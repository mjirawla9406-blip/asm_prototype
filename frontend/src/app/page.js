'use client';

import {
  Bell, User, ChevronDown, Search, Filter,
  Upload, Download, Plus, ChevronLeft, ChevronRight,
  FileText, Image as ImageIcon, Activity
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
    setTriggerUpload, setScans, setScanLoading,
    analysisLoading, analysisProgress, analysisMessage
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

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const exportMenuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  const generateFinalReport = () => {
    if (!analysisResult) return;

    let insightsHTML = analysisResult.insights.map(ins => `
        <div class="insight-card">
            <h4>${ins.category.toUpperCase()}</h4>
            <h3 style="color: ${ins.severity === 'critical' ? '#ef4444' : ins.severity === 'warning' ? '#f59e0b' : '#3b82f6'}">${ins.title}</h3>
            <p>${ins.description}</p>
        </div>
    `).join('');

    let setsHTML = analysisResult.sets.map(set => `
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 8px;"><strong>Set ${set.set_id}</strong></td>
            <td style="padding: 8px;">${set.mean_dip.toFixed(1)}&deg;</td>
            <td style="padding: 8px;">${set.mean_dip_direction.toFixed(1)}&deg;</td>
            <td style="padding: 8px;">${set.fisher_k ? set.fisher_k.toFixed(1) : 'N/A'}</td>
            <td style="padding: 8px;">${set.spacing ? set.spacing.toFixed(2) + 'm' : 'N/A'}</td>
            <td style="padding: 8px;">${set.roughness || 'N/A'}</td>
            <td style="padding: 8px;"><div style="width: 16px; height: 16px; background-color: ${set.color || '#ccc'}; border-radius: 4px;"></div></td>
        </tr>
    `).join('');

    let stereonetImg = analysisResult.stereonet_b64 
        ? `<img src="data:image/png;base64,${analysisResult.stereonet_b64}" style="width: 100%; max-width: 400px; border-radius: 8px; border: 1px solid #e5e7eb; box-shadow: 0 2px 4px rgba(0,0,0,0.05);" />`
        : `<p style="color:#6b7280; font-style:italic;">No stereonet available.</p>`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
          <title>Automated Structural Mapping - Final Report (${selectedScanId})</title>
          <style>
              body { font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; margin: 0; padding: 40px; color: #1f2937; line-height: 1.6; background: #f3f4f6; }
              .container { max-width: 1000px; margin: 0 auto; background: #fff; padding: 50px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1); border-radius: 12px; }
              .header { border-bottom: 2px solid #f3f4f6; padding-bottom: 30px; margin-bottom: 40px; display: flex; justify-content: space-between; align-items: flex-start; }
              h1 { margin: 0; color: #111827; font-size: 32px; letter-spacing: -0.02em; }
              .subtitle { font-size: 15px; color: #6b7280; margin-top: 8px; font-weight: 500; }
              .meta-box { background: #f9fafb; border: 1px solid #e5e7eb; padding: 16px; border-radius: 8px; text-align: right; }
              .meta-item { margin-bottom: 6px; font-size: 13px; color: #4b5563; }
              .meta-item strong { color: #111827; }
              h2 { color: #1f2937; font-size: 22px; margin-top: 40px; margin-bottom: 20px; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; font-weight: 700; letter-spacing: -0.01em; }
              table { width: 100%; border-collapse: collapse; margin-top: 10px; border-radius: 8px; overflow: hidden; }
              th { text-align: left; padding: 12px 16px; background: #f9fafb; color: #374151; font-weight: 600; font-size: 14px; border-bottom: 1px solid #e5e7eb; }
              td { font-size: 14px; color: #111827; }
              .insight-card { background: #fff; border: 1px solid #e5e7eb; border-left: 4px solid #3b82f6; padding: 20px; border-radius: 8px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
              .insight-card h4 { margin: 0 0 6px 0; font-size: 11px; color: #6b7280; letter-spacing: 0.05em; font-weight: 700; }
              .insight-card h3 { margin: 0 0 12px 0; font-size: 18px; letter-spacing: -0.01em; }
              .insight-card p { margin: 0; font-size: 15px; color: #4b5563; line-height: 1.5; }
              .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: start; }
              .stats-card { background: #f9fafb; border: 1px solid #e5e7eb; padding: 24px; border-radius: 12px; text-align: center; }
              .stats-value { font-size: 36px; font-weight: 800; color: #2563eb; line-height: 1; margin-bottom: 8px; }
              .stats-label { font-size: 13px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
              @media print {
                  body { background: #fff; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                  .container { box-shadow: none; padding: 0; max-width: 100%; border-radius: 0; }
                  .button-container { display: none; }
                  .insight-card { break-inside: avoid; border-left-width: 4px !important; }
                  table { break-inside: auto; }
                  tr { break-inside: avoid; break-after: auto; }
                  thead { display: table-header-group; }
                  tfoot { display: table-footer-group; }
                  h2 { break-after: avoid; }
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="button-container" style="text-align: right; margin-bottom: 30px;">
                  <button onclick="window.print()" style="background: #2563eb; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px; box-shadow: 0 4px 6px rgba(37, 99, 235, 0.2); transition: background 0.2s;">
                      <svg style="width:16px;height:16px;vertical-align:-3px;margin-right:6px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                      Print / Save as PDF
                  </button>
              </div>
              <div class="header">
                  <div>
                      <h1>Final Analysis Report</h1>
                      <div class="subtitle">Automated Structural Mapping | Drone Digital Twin Platform</div>
                  </div>
                  <div class="meta-box">
                      <div class="meta-item">Scan ID: <strong style="font-family: monospace;">${selectedScanId}</strong></div>
                      <div class="meta-item">Date: <strong>${new Date().toLocaleDateString(undefined, {year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute:'2-digit'})}</strong></div>
                      <div class="meta-item">Processing Time: <strong>${analysisResult.processing_time}s</strong></div>
                  </div>
              </div>

              <div class="grid-2">
                  <div style="display: flex; flex-direction: column; gap: 20px;">
                      <h2>Summary Statistics</h2>
                      <div class="stats-card">
                          <div class="stats-value">${analysisResult.num_planes}</div>
                          <div class="stats-label">Total Planes Detected</div>
                      </div>
                      <div class="stats-card">
                          <div class="stats-value" style="color: #059669;">${analysisResult.num_sets}</div>
                          <div class="stats-label">Major Discontinuity Sets</div>
                      </div>
                  </div>
                  <div>
                      <h2>Stereonet Visualization</h2>
                      <div style="text-align: center;">
                          ${stereonetImg}
                      </div>
                  </div>
              </div>

              <h2>Discontinuity Sets Detailed Metrics</h2>
              <table>
                  <thead>
                      <tr>
                          <th>Set ID</th>
                          <th>Mean Dip</th>
                          <th>Mean Dip Dir</th>
                          <th>Fisher K</th>
                          <th>Avg Spacing</th>
                          <th>Roughness Profile</th>
                          <th>Visual Color</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${setsHTML}
                  </tbody>
              </table>

              <h2 style="margin-top: 50px;">Geotechnical Insights & Stability Issues</h2>
              <div style="display: flex; flex-direction: column; gap: 4px;">
                  ${insightsHTML || '<p style="color: #6b7280; font-style: italic;">No specific insights were identified for this dataset.</p>'}
              </div>

              <div style="margin-top: 60px; padding-top: 30px; border-top: 1px solid #e5e7eb; font-size: 13px; color: #9ca3af; text-align: center;">
                  <strong>Disclaimer:</strong> This is an AI-generated algorithmic report. All safety-critical metrics, kinematic stability assessments, and discontinuity mappings should be independently verified by a qualified geotechnical engineer before operational use.
              </div>
          </div>
      </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const handleDownload = async (type) => {
    if (!selectedScanId) return;
    setDownloading(type);
    setShowExportMenu(false);
    try {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        let url, filename;
        switch (type) {
            case 'classified_las':
                url = `${API_BASE}/api/analysis/${selectedScanId}/classified-las`;
                filename = `ASM_${selectedScanId}_classified.las`;
                break;
            case 'stereonet':
                url = `${API_BASE}/api/analysis/${selectedScanId}/stereonet`;
                filename = `ASM_${selectedScanId}_stereonet.png`;
                break;
            case 'dips_csv':
                url = `${API_BASE}/export/dips/${selectedScanId}`;
                filename = `ASM_${selectedScanId}_dips.csv`;
                break;
            case 'report':
                generateFinalReport();
                setDownloading(null);
                return;
            default: 
                return;
        }
        
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'X-API-Key': process.env.NEXT_PUBLIC_API_KEY || ''
            }
        });
        
        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new Error(error.detail || 'Download failed');
        }
        
        const responseBlob = await res.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(responseBlob);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
        }, 500);

    } catch (e) {
        console.warn(`Download ${type} failed:`, e.message);
        alert(`Download failed: ${e.message}`);
    } finally {
        setDownloading(null);
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
          <div style={{ position: 'relative' }} ref={exportMenuRef}>
            <button 
              className="btn-secondary" 
              onClick={() => setShowExportMenu(!showExportMenu)}
              style={{ height: 36, padding: '0 12px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
            >
              {downloading ? <Activity size={14} className="animate-spin" /> : <Download size={14} />} 
              {downloading ? 'Exporting...' : 'Export'} 
              <ChevronDown size={14} />
            </button>

            {showExportMenu && (
                <div style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: 8,
                    background: 'var(--bg-secondary)', border: '1px solid #2a2f3a',
                    borderRadius: 8, boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                    width: 240, zIndex: 100, overflow: 'hidden'
                }}>
                    <button onClick={() => handleDownload('report')} className="export-menu-item" disabled={!selectedScanId} style={{ opacity: !selectedScanId ? 0.5 : 1 }}>
                        <FileText size={14} color="var(--accent-cyan)" /> Generate Final Report
                    </button>
                    <button onClick={() => handleDownload('classified_las')} className="export-menu-item" style={{ borderTop: '1px solid #2a2f3a', opacity: !selectedScanId ? 0.5 : 1 }} disabled={!selectedScanId}>
                        <FileText size={14} color="#3b82f6" /> Classified LAS File
                    </button>
                    <button onClick={() => handleDownload('stereonet')} className="export-menu-item" disabled={!selectedScanId} style={{ opacity: !selectedScanId ? 0.5 : 1 }}>
                        <ImageIcon size={14} color="#22c55e" /> Stereonet PNG
                    </button>
                    <button onClick={() => handleDownload('dips_csv')} className="export-menu-item" disabled={!selectedScanId} style={{ opacity: !selectedScanId ? 0.5 : 1 }}>
                        <Download size={14} color="#f59e0b" /> Dips/Unwedge CSV
                    </button>
                </div>
            )}
          </div>
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
            overflow: 'hidden', 
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            height: 500,
            border: '1px solid var(--accent-primary)', 
            position: 'relative',
          }}>
            <PointCloudViewer />
            
            {/* Analysis Pipeline Progress Overlay */}
            {analysisLoading && (
              <AnalysisPipelineOverlay progress={analysisProgress} message={analysisMessage} />
            )}
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
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.03)', padding: '4px 10px', borderRadius: 6, border: '1px solid #2a2f3a' }}>
                     ID: {selectedScanId} | Computed in {analysisResult.processing_time}s
                  </div>
                  
                  <button 
                    onClick={() => handleDownload('report')}
                    style={{
                      background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-cyan))', 
                      color: '#000', 
                      border: 'none', 
                      padding: '6px 14px', 
                      borderRadius: 6, 
                      fontSize: 12, 
                      fontWeight: 700, 
                      cursor: 'pointer', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 6,
                      boxShadow: '0 0 10px rgba(59, 130, 246, 0.4)'
                    }}
                  >
                    {downloading === 'report' ? <Activity size={14} className="animate-spin" /> : <Download size={14} />} 
                    {downloading === 'report' ? 'Generating...' : 'Generate Final Report'}
                  </button>
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


/**
 * Analysis Pipeline Progress Overlay
 * Shows the 4-phase pipeline with progress during analysis.
 */
function AnalysisPipelineOverlay({ progress, message }) {
  const phases = [
    { id: 1, name: 'Loading & Preprocessing', progressRange: [0, 25], icon: '📡' },
    { id: 2, name: 'Plane Detection', progressRange: [25, 60], icon: '🔍' },
    { id: 3, name: 'Orientation & Clustering', progressRange: [60, 85], icon: '📐' },
    { id: 4, name: 'Insights & Export', progressRange: [85, 100], icon: '📊' },
  ];

  const getPhaseStatus = (phase) => {
    if (progress >= phase.progressRange[1]) return 'completed';
    if (progress >= phase.progressRange[0]) return 'active';
    return 'pending';
  };

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 50,
      background: 'rgba(10, 13, 17, 0.92)', backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 20, padding: 40,
    }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: 1 }}>
        Structural Mapping Pipeline
      </div>

      {/* Phase Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 340 }}>
        {phases.map((phase) => {
          const status = getPhaseStatus(phase);
          return (
            <div key={phase.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', borderRadius: 10,
              background: status === 'active' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${status === 'active' ? 'rgba(245, 158, 11, 0.3)' : status === 'completed' ? 'rgba(34, 197, 94, 0.2)' : '#2a2f3a'}`,
              transition: 'all 0.3s ease',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14,
                background: status === 'completed' ? 'rgba(34, 197, 94, 0.2)' : status === 'active' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.05)',
              }}>
                {status === 'completed' ? '✓' : status === 'active' ? phase.icon : phase.id}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700,
                  color: status === 'active' ? 'var(--accent-primary)' : status === 'completed' ? 'var(--success)' : 'var(--text-muted)',
                }}>
                  Phase {phase.id}: {phase.name}
                </div>
                {status === 'active' && (
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                    {message || 'Processing...'}
                  </div>
                )}
              </div>
              {status === 'active' && (
                <div style={{
                  width: 14, height: 14, border: '2px solid var(--accent-primary)',
                  borderTopColor: 'transparent', borderRadius: '50%',
                  animation: 'spin-slow 1s linear infinite',
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Overall progress bar */}
      <div style={{ width: 340 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Overall Progress</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-primary)' }}>{progress}%</span>
        </div>
        <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            width: `${progress}%`, height: '100%',
            background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-cyan))',
            borderRadius: 3, transition: 'width 0.5s ease',
          }} />
        </div>
      </div>
    </div>
  );
}

