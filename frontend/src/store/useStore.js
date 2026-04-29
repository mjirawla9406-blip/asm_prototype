/**
 * Zustand state management store for the Structural Mapping module.
 */
import { create } from 'zustand';

const useStore = create((set, get) => ({
    // Scans
    scans: [],
    selectedScanId: null,
    scanLoading: false,

    // Analysis
    analysisResult: null,
    analysisLoading: false,
    analysisProgress: 0,
    analysisMessage: '',

    // Point cloud
    pointCloudData: null,
    pointCloudLoading: false,

    // Visualization controls
    visibleSets: new Set(),
    selectedPlaneId: null,
    showPlanes: false,
    showNormals: false,
    showLabels: false,
    viewMode: 'original', // 'original' (before), 'analyzed' (after)
    pointSize: 0.03,
    pointDensity: 50000,
    dashboardCollapsed: false,
    layoutMode: 'single', // 'single' (3D only), 'multi' (5-panel)
    viewerMode: 'potree',         // 'potree' | 'threejs' — default to potree
    potreeScanFile: null,          // File object to pass to the Potree iframe
    currentScanId: null,           // Current scan URL/ID for Potree streaming
    potreeOrigin: null,     // { cx, cy, cz } reported by Potree after each LAS load
    autoRotate: false,      // Whether the viewer is auto-rotating

    // UI
    showScanLibrary: true, // Whether the scan library panel is visible
    triggerUpload: false, // Whether to automatically trigger the upload dialog
    rightPanelTab: 'pipeline',

    // BIMSu scan state
    currentSiteId: null,
    scanStatus: 'idle',        // 'idle' | 'uploading' | 'processing' | 'complete' | 'failed'
    uploadProgress: 0,
    asmResult: null,           // Full ASMResponse from /api/analyse
    warnings: [],              // From asmResult.warnings
    error: null,               // From asmResult.error or pipeline failure message

    // Actions
    setScans: (scans) => set({ scans }),
    setSelectedScanId: (id) => set({ selectedScanId: id }),
    setScanLoading: (v) => set({ scanLoading: v }),
    setRightPanelTab: (tab) => set({ rightPanelTab: tab }),

    setAnalysisResult: (result) => {
        const visibleSets = new Set();
        if (result?.sets) {
            result.sets.forEach(s => visibleSets.add(s.set_id));
        }
        set({ 
            analysisResult: result, 
            visibleSets,
            viewMode: result ? 'analyzed' : 'original',
            showPlanes: result ? true : false,
            layoutMode: result ? 'multi' : 'single' // Auto-switch to multi on analysis
        });
    },
    setAnalysisLoading: (v) => set({ analysisLoading: v }),
    setAnalysisProgress: (p, msg) => set({ analysisProgress: p, analysisMessage: msg || '' }),

    setPointCloudData: (data) => set({ pointCloudData: data }),
    setPointCloudLoading: (v) => set({ pointCloudLoading: v }),

    toggleSetVisibility: (setId) => {
        const current = new Set(get().visibleSets);
        if (current.has(setId)) {
            current.delete(setId);
        } else {
            current.add(setId);
        }
        set({ visibleSets: current });
    },

    showAllSets: () => {
        const result = get().analysisResult;
        if (result?.sets) {
            const all = new Set(result.sets.map(s => s.set_id));
            set({ visibleSets: all });
        }
    },

    hideAllSets: () => set({ visibleSets: new Set() }),

    setSelectedPlaneId: (id) => set({ selectedPlaneId: id }),
    setShowPlanes: (v) => set({ showPlanes: v }),
    setShowNormals: (v) => set({ showNormals: v }),
    setShowLabels: (v) => set({ showLabels: v }),
    setViewMode: (mode) => set({ viewMode: mode }),
    setLayoutMode: (mode) => set({ layoutMode: mode }),
    setViewerMode: (mode) => set({ viewerMode: mode }),
    setPotreeScanFile: (file) => set({ potreeScanFile: file }),
    setCurrentScanId: (id) => set({ currentScanId: id }),
    setPotreeOrigin: (origin) => set({ potreeOrigin: origin }),
    setAutoRotate:   (v)      => set({ autoRotate: v }),
    setPointSize: (v) => set({ pointSize: v }),
    setPointDensity: (v) => set({ pointDensity: v }),
    setDashboardCollapsed: (v) => set({ dashboardCollapsed: v }),
    setShowScanLibrary: (v) => set({ showScanLibrary: v }),
    setTriggerUpload: (v) => set({ triggerUpload: v }),

    // BIMSu actions
    setCurrentSiteId: (id) => set({ currentSiteId: id }),

    setScanStatus: (status) => set({ scanStatus: status }),

    setUploadProgress: (pct) => set({ uploadProgress: Math.round(pct) }),

    setAsmResult: (result) => {
        const visibleSets = new Set();
        if (result?.joint_sets) {
            result.joint_sets.forEach(s => visibleSets.add(s.set_id));
        }
        set({
            asmResult: result,
            warnings: result?.warnings || [],
            error: result?.error || null,
            scanStatus: result?.error ? 'failed' : 'complete',
            visibleSets,
            viewMode: result ? 'analyzed' : 'original',
            layoutMode: result ? 'multi' : 'single',
        });
    },

    setError: (msg) => set({ error: msg, scanStatus: 'failed' }),

    clearResults: () => set({
        asmResult: null,
        warnings: [],
        error: null,
        scanStatus: 'idle',
        uploadProgress: 0,
    }),
}));

export default useStore;
