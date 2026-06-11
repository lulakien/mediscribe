/**
 * TypeScript type declarations for Electron preload API
 *
 * Matches the API exposed by desktop/electron/src/preload.ts
 * Per DESIGN.md §9.1: Minimal IPC surface for security
 */

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
 * The mediscribe API exposed to the renderer via contextBridge
 *
 * Security: contextIsolation=true, minimal IPC surface
 * All business logic (jobs, models, settings) goes via HTTP/WebSocket to backend
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

declare global {
  interface Window {
    mediscribe: MediScribeAPI;
  }
}

export {};
