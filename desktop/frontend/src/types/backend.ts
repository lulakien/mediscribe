/**
 * Backend connection and status types
 */

export interface BackendInfo {
  url: string;
  token: string;
  version?: string;
  status?: string;
  available?: boolean;
}

export interface BackendStatus {
  available: boolean;
  url: string;
  error?: string;
}

export type BackendStatusCallback = (status: BackendStatus) => void;
