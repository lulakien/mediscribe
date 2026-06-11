// Zustand store for UI state management

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { ManifestRow, TranscriptionOptions } from '../types';

// Preset configurations for transcription
export interface TranscriptionPreset {
  id: string;
  name: string;
  description: string;
  options: Partial<TranscriptionOptions>;
}

export const defaultPresets: TranscriptionPreset[] = [
  {
    id: 'accurate',
    name: 'Accurate',
    description: 'Highest accuracy, slower processing',
    options: {
      beam_size: 5,
      temperature: 0.0,
    },
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Good balance of speed and accuracy',
    options: {
      beam_size: 3,
      temperature: 0.0,
    },
  },
  {
    id: 'fast',
    name: 'Fast',
    description: 'Quick processing, good accuracy',
    options: {
      beam_size: 1,
      temperature: 0.0,
    },
  },
];

interface UiState {
  // File manifest
  manifestRows: ManifestRow[];
  selectedFiles: string[];

  // Transcription options
  activePreset: string;
  customOptions: Partial<TranscriptionOptions>;

  // Run panel state
  runPanelOpen: boolean;
  runPanelTab: 'configure' | 'progress' | 'results';
  activeJobId: string | null;

  // UI preferences
  sidebarCollapsed: boolean;
  theme: 'light' | 'dark' | 'system';

  // Actions
  setManifestRows: (rows: ManifestRow[]) => void;
  addManifestRows: (rows: ManifestRow[]) => void;
  removeManifestRows: (filePaths: string[]) => void;
  updateManifestRow: (filePath: string, updates: Partial<ManifestRow>) => void;
  clearManifest: () => void;

  setSelectedFiles: (files: string[]) => void;
  toggleFileSelection: (filePath: string) => void;
  selectAllFiles: () => void;
  deselectAllFiles: () => void;

  setActivePreset: (presetId: string) => void;
  setCustomOptions: (options: Partial<TranscriptionOptions>) => void;
  updateCustomOption: <K extends keyof TranscriptionOptions>(
    key: K,
    value: TranscriptionOptions[K]
  ) => void;

  setRunPanelOpen: (open: boolean) => void;
  setRunPanelTab: (tab: 'configure' | 'progress' | 'results') => void;
  setActiveJobId: (jobId: string | null) => void;

  setSidebarCollapsed: (collapsed: boolean) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // Computed helpers
  getSelectedManifestRows: () => ManifestRow[];
  getCurrentOptions: () => Partial<TranscriptionOptions>;
}

export const useUiStore = create<UiState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        manifestRows: [],
        selectedFiles: [],
        activePreset: 'balanced',
        customOptions: {},
        runPanelOpen: false,
        runPanelTab: 'configure',
        activeJobId: null,
        sidebarCollapsed: false,
        theme: 'system',

        // Manifest actions
        setManifestRows: (rows) => set({ manifestRows: rows }),

        addManifestRows: (rows) =>
          set((state) => {
            const existingPaths = new Set(state.manifestRows.map((r) => r.file_path));
            const newRows = rows.filter((r) => !existingPaths.has(r.file_path));
            return { manifestRows: [...state.manifestRows, ...newRows] };
          }),

        removeManifestRows: (filePaths) =>
          set((state) => {
            const pathSet = new Set(filePaths);
            return {
              manifestRows: state.manifestRows.filter((r) => !pathSet.has(r.file_path)),
              selectedFiles: state.selectedFiles.filter((f) => !pathSet.has(f)),
            };
          }),

        updateManifestRow: (filePath, updates) =>
          set((state) => ({
            manifestRows: state.manifestRows.map((row) =>
              row.file_path === filePath ? { ...row, ...updates } : row
            ),
          })),

        clearManifest: () => set({ manifestRows: [], selectedFiles: [] }),

        // Selection actions
        setSelectedFiles: (files) => set({ selectedFiles: files }),

        toggleFileSelection: (filePath) =>
          set((state) => {
            const selected = state.selectedFiles.includes(filePath);
            return {
              selectedFiles: selected
                ? state.selectedFiles.filter((f) => f !== filePath)
                : [...state.selectedFiles, filePath],
            };
          }),

        selectAllFiles: () =>
          set((state) => ({
            selectedFiles: state.manifestRows.map((r) => r.file_path),
          })),

        deselectAllFiles: () => set({ selectedFiles: [] }),

        // Preset and options actions
        setActivePreset: (presetId) => set({ activePreset: presetId, customOptions: {} }),

        setCustomOptions: (options) => set({ customOptions: options, activePreset: 'custom' }),

        updateCustomOption: (key, value) =>
          set((state) => ({
            customOptions: { ...state.customOptions, [key]: value },
            activePreset: 'custom',
          })),

        // Run panel actions
        setRunPanelOpen: (open) => set({ runPanelOpen: open }),

        setRunPanelTab: (tab) => set({ runPanelTab: tab }),

        setActiveJobId: (jobId) => set({ activeJobId: jobId }),

        // UI preferences
        setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

        setTheme: (theme) => set({ theme }),

        // Computed helpers
        getSelectedManifestRows: () => {
          const state = get();
          const selectedSet = new Set(state.selectedFiles);
          return state.manifestRows.filter((r) => selectedSet.has(r.file_path));
        },

        getCurrentOptions: () => {
          const state = get();
          if (state.activePreset === 'custom') {
            return state.customOptions;
          }
          const preset = defaultPresets.find((p) => p.id === state.activePreset);
          return preset?.options || {};
        },
      }),
      {
        name: 'mediscribe-ui-store',
        partialize: (state) => ({
          // Only persist these fields
          activePreset: state.activePreset,
          customOptions: state.customOptions,
          sidebarCollapsed: state.sidebarCollapsed,
          theme: state.theme,
        }),
      }
    )
  )
);

// Selector hooks for common use cases
export const useManifestRows = () => useUiStore((state) => state.manifestRows);
export const useSelectedFiles = () => useUiStore((state) => state.selectedFiles);
export const useActivePreset = () => useUiStore((state) => state.activePreset);
export const useRunPanelState = () =>
  useUiStore((state) => ({
    open: state.runPanelOpen,
    tab: state.runPanelTab,
    activeJobId: state.activeJobId,
  }));
