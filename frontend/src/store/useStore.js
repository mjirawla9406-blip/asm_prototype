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

    // UI
    showScanLibrary: true, // Whether the scan library panel is visible
    triggerUpload: false, // Whether to automatically trigger the upload dialog
    rightPanelTab: 'planes',

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
            showPlanes: false,
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
    setPointSize: (v) => set({ pointSize: v }),
    setPointDensity: (v) => set({ pointDensity: v }),
    setDashboardCollapsed: (v) => set({ dashboardCollapsed: v }),
    setShowScanLibrary: (v) => set({ showScanLibrary: v }),
    setTriggerUpload: (v) => set({ triggerUpload: v }),
}));

export default useStore;
