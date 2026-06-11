// WebSocket connection manager for real-time events
import { useEffect } from 'react';
import type { ProgressEvent } from '../types';

type EventHandler = (event: ProgressEvent) => void;

class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelay: number = 1000;
  private maxReconnectDelay: number = 30000;
  private handlers: Set<EventHandler> = new Set();
  private url: string = '';
  private connected: boolean = false;
  private intentionallyClosed: boolean = false;

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      // Get backend URL from Electron preload API
      const backendInfo = await window.mediscribe.getBackendInfo();

      if (!backendInfo.url) {
        throw new Error('Backend is not available');
      }

      // Convert http(s) URL to ws(s)
      this.url = backendInfo.url.replace(/^http/, 'ws') + '/ws/events';

      this.intentionallyClosed = false;
      this.createConnection();
    } catch (error) {
      console.error('Failed to initialize WebSocket connection:', error);
      this.scheduleReconnect();
    }
  }

  private createConnection(): void {
    if (this.intentionallyClosed) {
      return;
    }

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.connected = true;
        this.reconnectDelay = 1000; // Reset delay on successful connection
      };

      this.ws.onmessage = (event) => {
        try {
          const data: ProgressEvent = JSON.parse(event.data);
          this.notifyHandlers(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        this.connected = false;
        this.ws = null;

        // Reconnect if not intentionally closed
        if (!this.intentionallyClosed) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.intentionallyClosed) {
      return;
    }

    console.log(`Reconnecting in ${this.reconnectDelay}ms...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.createConnection();

      // Exponential backoff
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    }, this.reconnectDelay);
  }

  disconnect(): void {
    this.intentionallyClosed = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
  }

  subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.delete(handler);
    };
  }

  private notifyHandlers(event: ProgressEvent): void {
    this.handlers.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in WebSocket event handler:', error);
      }
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket is not connected, cannot send message');
    }
  }
}

// Singleton instance
export const wsManager = new WebSocketManager();

// React hook for using WebSocket events
export function useWebSocket(handler: EventHandler): void {
  useEffect(() => {
    // Connect on mount
    wsManager.connect();

    // Subscribe to events
    const unsubscribe = wsManager.subscribe(handler);

    // Cleanup on unmount
    return () => {
      unsubscribe();
    };
  }, [handler]);
}
