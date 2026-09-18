import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface PythonServiceOptions {
  token: string;
  dataDir: string;
}

export interface BackendInfo {
  port: number;
  pid: number;
  uptime: number;
}

/**
 * PythonService - Supervises the Python FastAPI backend process
 *
 * Requirements per DESIGN.md §9.4:
 * - Spawn Python backend with env: MEDISCRIBE_PORT=0, MEDISCRIBE_TOKEN, MEDISCRIBE_DATA_DIR
 * - Parse "READY port=<n>" from stdout
 * - Health check polling GET /health every 10s
 * - Graceful shutdown: POST /shutdown, wait 8s, SIGTERM, SIGKILL
 * - Auto-restart on crash (max 2 times)
 * - Resolve Python interpreter path (bundled or system)
 */
export class PythonService {
  private process: ChildProcess | null = null;
  private token: string;
  private dataDir: string;
  private port: number = 0;
  private startTime: number = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private failedHealthChecks: number = 0;
  private restartCount: number = 0;
  private maxRestarts: number = 2;
  private isShuttingDown: boolean = false;

  constructor(options: PythonServiceOptions) {
    this.token = options.token;
    this.dataDir = options.dataDir;
  }

  /**
   * Start the Python backend process and wait for it to be ready
   * Returns the backend URL (http://127.0.0.1:<port>)
   */
  async start(): Promise<string> {
    const pythonExecutable = this.getPythonExecutable();
    const backendPath = this.getBackendPath();

    console.log(`Starting Python backend: ${pythonExecutable} ${backendPath}`);

    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        MEDISCRIBE_PORT: '0', // OS-assigned ephemeral port
        MEDISCRIBE_TOKEN: this.token,
        MEDISCRIBE_DATA_DIR: this.dataDir,
        HF_HOME: path.join(this.dataDir, 'huggingface'),
      };

      this.process = spawn(pythonExecutable, [backendPath], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.startTime = Date.now();
      let portParsed = false;

      const startupTimeout = setTimeout(() => {
        if (!portParsed) {
          this.cleanup();
          reject(new Error('Backend startup timeout - no READY signal received within 30s'));
        }
      }, 30000);

      // Parse stdout for "READY port=<n>"
      this.process.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        console.log('[Backend stdout]', output);

        const match = output.match(/READY port=(\d+)/);
        if (match && !portParsed) {
          portParsed = true;
          clearTimeout(startupTimeout);
          this.port = parseInt(match[1], 10);
          const url = `http://127.0.0.1:${this.port}`;

          // Wait for health check before resolving
          this.waitForHealthy(url)
            .then(() => {
              console.log(`Backend healthy at ${url}`);
              this.startHealthCheck(url);
              resolve(url);
            })
            .catch((error) => {
              this.cleanup();
              reject(error);
            });
        }
      });

      // Log stderr
      this.process.stderr?.on('data', (data: Buffer) => {
        console.error('[Backend stderr]', data.toString());
      });

      // Handle process exit (auto-restart on crash)
      this.process.on('exit', (code, signal) => {
        console.log(`Backend process exited: code=${code}, signal=${signal}`);

        if (!this.isShuttingDown && !portParsed) {
          // Failed during startup
          clearTimeout(startupTimeout);
          reject(new Error(`Backend failed to start: exit code ${code}`));
        } else if (!this.isShuttingDown && this.restartCount < this.maxRestarts) {
          // Auto-restart on crash (max 2 times per DESIGN.md §9.4)
          console.log(`Backend crashed. Attempting restart ${this.restartCount + 1}/${this.maxRestarts}`);
          this.restartCount++;
          this.restart();
        } else if (!this.isShuttingDown) {
          console.error('Backend crashed and max restart attempts reached');
          this.stopHealthCheck();
        }
      });

      // Handle spawn errors
      this.process.on('error', (error) => {
        console.error('Backend spawn error:', error);
        clearTimeout(startupTimeout);
        this.cleanup();
        reject(error);
      });
    });
  }

  /**
   * Wait for backend to respond to health checks
   */
  private async waitForHealthy(url: string, maxAttempts: number = 10): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`${url}/health`, {
          headers: { Authorization: `Bearer ${this.token}` },
          signal: AbortSignal.timeout(2000),
        });

        if (response.ok) {
          const data = await response.json();
          console.log('Backend health check passed:', data);
          this.failedHealthChecks = 0;
          return;
        }
      } catch (error) {
        // Retry
      }

      // Wait 1s before retry
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error('Backend health check failed after multiple attempts');
  }

  /**
   * Start periodic health check polling (every 10s per DESIGN.md §9.4)
   */
  private startHealthCheck(url: string): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        const response = await fetch(`${url}/health`, {
          headers: { Authorization: `Bearer ${this.token}` },
          signal: AbortSignal.timeout(3000),
        });

        if (response.ok) {
          this.failedHealthChecks = 0;
        } else {
          this.handleHealthCheckFailure();
        }
      } catch (error) {
        this.handleHealthCheckFailure();
      }
    }, 10000); // 10s interval per design
  }

  /**
   * Stop health check polling
   */
  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Handle health check failure (3 consecutive failures = unhealthy)
   */
  private handleHealthCheckFailure(): void {
    this.failedHealthChecks++;
    console.warn(`Backend health check failed (${this.failedHealthChecks}/3)`);

    if (this.failedHealthChecks >= 3) {
      console.error('Backend unhealthy after 3 consecutive failures');
      this.stopHealthCheck();
      // Main process should detect this via getHealthCheckFailures() and show degraded state
    }
  }

  /**
   * Graceful shutdown sequence per DESIGN.md §9.4:
   * POST /shutdown, wait 8s, SIGTERM, SIGKILL
   */
  async shutdown(url: string, token: string): Promise<void> {
    if (!this.process || this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.stopHealthCheck();

    console.log('Initiating graceful backend shutdown...');

    // Step 1: POST /shutdown
    try {
      await fetch(`${url}/shutdown`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(2000),
      });
      console.log('Shutdown signal sent to backend');
    } catch (error) {
      console.warn('Failed to send shutdown signal:', error);
    }

    // Step 2: Wait 8s for graceful exit (per DESIGN.md §9.4)
    await this.waitForExit(8000);

    if (this.process && !this.process.killed) {
      // Step 3: SIGTERM
      console.log('Sending SIGTERM to backend');
      this.process.kill('SIGTERM');
      await this.waitForExit(3000);
    }

    if (this.process && !this.process.killed) {
      // Step 4: SIGKILL
      console.log('Forcing SIGKILL to backend');
      this.process.kill('SIGKILL');
      await this.waitForExit(1000);
    }

    this.cleanup();
    console.log('Backend shutdown complete');
  }

  /**
   * Wait for process to exit, up to timeout
   */
  private async waitForExit(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      if (!this.process || this.process.killed || this.process.exitCode !== null) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        resolve();
      }, timeoutMs);

      this.process.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  /**
   * Force kill the backend process (used in will-quit emergency cleanup)
   */
  kill(): void {
    if (this.process && !this.process.killed) {
      console.log('Force killing backend process');
      this.process.kill('SIGKILL');
    }
    this.cleanup();
  }

  /**
   * Restart the backend after a crash
   */
  private async restart(): Promise<void> {
    this.cleanup();

    try {
      const url = await this.start();
      console.log(`Backend restarted successfully at ${url}`);
    } catch (error) {
      console.error('Backend restart failed:', error);
    }
  }

  /**
   * Clean up process references
   */
  private cleanup(): void {
    this.stopHealthCheck();
    this.process = null;
    this.port = 0;
  }

  /**
   * Get the path to the Python backend
   * Production: resources/backend/main.py
   * Development: relative to project root
   */
  private getBackendPath(): string {
    const resourcesPath = process.resourcesPath || path.join(__dirname, '../../');
    const bundledBackend = path.join(resourcesPath, 'backend', 'main.py');
    if (fs.existsSync(bundledBackend)) {
      return bundledBackend;
    }

    return path.join(__dirname, '../../backend/main.py');
  }

  /**
   * Resolve Python interpreter path
   * Priority: bundled Python > system Python
   * Per DESIGN.md §9.3: "bundle a self-contained Python inside Electron resources dir"
   */
  private getPythonExecutable(): string {
    if (process.env.MEDISCRIBE_PYTHON) {
      return process.env.MEDISCRIBE_PYTHON;
    }

    const resourcesPath = process.resourcesPath || path.join(__dirname, '../../');
    const resourceVenvPython = path.join(resourcesPath, 'backend', '.venv', 'bin', 'python');
    if (fs.existsSync(resourceVenvPython)) {
      return resourceVenvPython;
    }

    const sourceBackendVenv = path.join(__dirname, '../../backend/.venv/bin/python');
    if (fs.existsSync(sourceBackendVenv)) {
      return sourceBackendVenv;
    }

    // Production: bundled Python (when packaged)
    const bundledPython = path.join(resourcesPath, 'python', 'bin', 'python3');

    if (fs.existsSync(bundledPython)) {
      return bundledPython;
    }

    console.warn('Bundled Python not found, falling back to system python3');

    // Development: system Python
    // Try python3 first (Linux/macOS), then python (Windows)
    return process.platform === 'win32' ? 'python' : 'python3';
  }

  /**
   * Get backend info for debugging (Advanced page)
   */
  getInfo(): BackendInfo | null {
    if (!this.process || this.port === 0) {
      return null;
    }

    return {
      port: this.port,
      pid: this.process.pid || 0,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  /**
   * Check if backend process is running
   */
  isRunning(): boolean {
    return this.process !== null && !this.process.killed && this.process.exitCode === null;
  }

  /**
   * Get the backend port
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Get health check failure count (for UI degraded state detection)
   */
  getHealthCheckFailures(): number {
    return this.failedHealthChecks;
  }

  /**
   * Get restart count (for UI display)
   */
  getRestartCount(): number {
    return this.restartCount;
  }
}
