// HTTP client for MediScribe backend API

import type { BackendInfo } from '../types';

class ApiClient {
  private baseUrl: string = '';
  private token: string = '';
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Get backend info from Electron preload API
      const backendInfo: BackendInfo = await window.mediscribe.getBackendInfo();

      if (backendInfo.available === false || !backendInfo.url) {
        throw new Error('Backend is not available');
      }

      this.baseUrl = backendInfo.url;
      this.token = backendInfo.token;
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize API client:', error);
      throw error;
    }
  }

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`,
    };
  }

  async get<T>(path: string): Promise<T> {
    await this.initialize();

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async post<T>(path: string, data?: unknown): Promise<T> {
    await this.initialize();

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async put<T>(path: string, data?: unknown): Promise<T> {
    await this.initialize();

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async delete<T>(path: string, data?: unknown): Promise<T> {
    await this.initialize();

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async uploadFiles(files: File[]): Promise<{ file_paths: string[] }> {
    await this.initialize();

    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });

    const response = await fetch(`${this.baseUrl}/files/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}

// Singleton instance
export const apiClient = new ApiClient();
