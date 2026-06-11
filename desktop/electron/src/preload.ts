/**
 * Preload script for MediScribe Desktop
 *
 * Exposes a minimal, secure API to the renderer via contextBridge.
 * Security: contextIsolation=true, nodeIntegration=false, sandbox=true
 *
 * Per DESIGN.md §9.1: Minimal IPC surface - only native dialogs, shell operations,
 * and backend connection info. All business logic (jobs, models, settings) goes
 * renderer → FastAPI over HTTP/WebSocket.
 */

import { contextBridge, ipcRenderer } from 'electron';

/**
 * Backend connection information
 */
export interface BackendInfo {
  url: string;
  token: string;
}

/**
 * Backend status update structure
 */
export interface BackendStatus {
  available: boolean;
  url: string;
  error?: string;
}

/**
 * Desktop runtime information for diagnostics.
 */
export interface AppInfo {
  appVersion: string;
  electronVersion: string;
  nodeVersion: string;
  chromeVersion: string;
  platform: string;
}

/**
 * Callback type for backend status changes
 */
export type BackendStatusCallback = (status: BackendStatus) => void;

/**
 * The mediscribe API exposed to the renderer process
 *
 * Methods:
 * - pickFiles(): Multi-select audio file picker
 * - pickFolder(): Single folder picker
 * - revealPath(p): Show file/folder in system file manager
 * - openPath(p): Open file/folder with default application
 * - getBackendInfo(): Get backend URL and auth token
 * - onBackendStatus(cb): Subscribe to backend status changes
 */
export interface MediScribeAPI {
  /**
   * Open native file picker for audio files (multi-select)
   * Filters: mp3, mpeg, mpga, m4a, wav, flac, ogg, opus, webm
   * @returns Array of absolute file paths, or null if cancelled
   */
  pickFiles: () => Promise<string[] | null>;

  /**
   * Open native folder picker
   * @returns Absolute folder path, or null if cancelled
   */
  pickFolder: () => Promise<string | null>;

  /**
   * Reveal a file or folder in the system file manager
   * Ubuntu: opens in Nautilus/default file manager
   * @param path Absolute path to reveal
   */
  revealPath: (path: string) => Promise<void>;

  /**
   * Open a file or folder with the default system application
   * @param path Absolute path to open
   */
  openPath: (path: string) => Promise<void>;

  /**
   * Get backend connection information (URL and auth token)
   * Used by the renderer to make authenticated HTTP/WebSocket requests
   * @returns Backend URL and bearer token
   */
  getBackendInfo: () => Promise<BackendInfo>;

  /**
   * Get desktop runtime versions for debug reporting.
   */
  getAppInfo: () => Promise<AppInfo>;

  /**
   * Register a callback for backend status changes
   * The callback is invoked when the backend becomes available/unavailable
   * @param callback Function called when backend status changes
   * @returns Cleanup function to remove the listener
   */
  onBackendStatus: (callback: BackendStatusCallback) => () => void;

  /**
   * Platform identifier (linux, darwin, win32)
   */
  platform: string;
}

// Expose the API to the renderer
contextBridge.exposeInMainWorld('mediscribe', {
  // File picker - multi-select audio files
  pickFiles: (): Promise<string[] | null> => {
    return ipcRenderer.invoke('pick-files');
  },

  // Folder picker - single folder selection
  pickFolder: (): Promise<string | null> => {
    return ipcRenderer.invoke('pick-folder');
  },

  // Reveal path in file manager (Ubuntu: Nautilus, etc.)
  revealPath: async (path: string): Promise<void> => {
    const result = await ipcRenderer.invoke('reveal-path', path);
    if (!result.success) {
      throw new Error(result.error || 'Failed to reveal path');
    }
  },

  // Open path with default application
  openPath: async (path: string): Promise<void> => {
    const result = await ipcRenderer.invoke('open-path', path);
    if (!result.success) {
      throw new Error(result.error || 'Failed to open path');
    }
  },

  // Get backend connection info (URL + token for HTTP auth)
  getBackendInfo: (): Promise<BackendInfo> => {
    return ipcRenderer.invoke('get-backend-info');
  },

  // Get Electron/Node runtime info for diagnostics
  getAppInfo: (): Promise<AppInfo> => {
    return ipcRenderer.invoke('get-app-info');
  },

  // Subscribe to backend status changes
  onBackendStatus: (callback: BackendStatusCallback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: BackendStatus) => {
      callback(status);
    };

    ipcRenderer.on('backend-status', listener);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('backend-status', listener);
    };
  },

  // Platform identifier (for platform-specific UI adjustments)
  platform: process.platform,
} as MediScribeAPI);
