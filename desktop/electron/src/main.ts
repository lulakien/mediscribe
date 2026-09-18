import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import * as path from 'path';
import * as crypto from 'crypto';
import { PythonService } from './python-service';

// Global references
let mainWindow: BrowserWindow | null = null;
let pythonService: PythonService | null = null;
let backendToken: string = '';
let backendUrl: string = '';
let isQuitting = false;

// Set the sandbox path before Electron initializes renderer/cache locations so
// this checkout cannot share user data with another MediScribe installation.
const sandboxUserDataDir = path.join(app.getPath('appData'), 'MediScribe Local Sandbox');
app.setPath('userData', sandboxUserDataDir);

// Security: Generate session token for backend auth
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Create the main browser window
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#F4EFE4',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Load the frontend
  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(process.resourcesPath, 'frontend', 'index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Handle window close - check for running jobs
  mainWindow.on('close', async (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();

    // Check if backend has running jobs
    if (pythonService && backendUrl) {
      try {
        const response = await fetch(`${backendUrl}/jobs`, {
          headers: { Authorization: `Bearer ${backendToken}` },
        });
        const payload = await response.json() as { jobs?: any[] } | any[];
        const jobs = Array.isArray(payload) ? payload : payload.jobs || [];
        const hasRunningJobs = jobs.some((job: any) => job.state === 'running');

        if (hasRunningJobs) {
          const choice = dialog.showMessageBoxSync(mainWindow!, {
            type: 'warning',
            title: 'Transcription Running',
            message: 'A transcription is running',
            detail: 'The current file will finish, then the app will quit. Continue?',
            buttons: ['Stop and Quit', 'Cancel'],
            defaultId: 1,
            cancelId: 1,
          });

          if (choice === 0) {
            // User chose to quit
            isQuitting = true;
            mainWindow?.close();
          }
        } else {
          // No running jobs, safe to quit
          isQuitting = true;
          mainWindow?.close();
        }
      } catch (error) {
        console.error('Error checking job status:', error);
        // Backend unavailable, allow quit
        isQuitting = true;
        mainWindow?.close();
      }
    } else {
      // Backend not started or no URL, allow quit
      isQuitting = true;
      mainWindow?.close();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers

// Pick multiple audio files
ipcMain.handle('pick-files', async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Audio Files',
        extensions: ['mp3', 'mpeg', 'mpga', 'm4a', 'wav', 'flac', 'ogg', 'opus', 'webm'],
      },
    ],
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths;
});

// Pick output folder
ipcMain.handle('pick-folder', async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0];
});

// Reveal path in file manager
ipcMain.handle('reveal-path', async (_event, filePath: string) => {
  try {
    shell.showItemInFolder(filePath);
    return { success: true };
  } catch (error) {
    console.error('Error revealing path:', error);
    return { success: false, error: String(error) };
  }
});

// Open path (file or folder)
ipcMain.handle('open-path', async (_event, itemPath: string) => {
  try {
    await shell.openPath(itemPath);
    return { success: true };
  } catch (error) {
    console.error('Error opening path:', error);
    return { success: false, error: String(error) };
  }
});

// Get backend connection info
ipcMain.handle('get-backend-info', () => {
  return {
    url: backendUrl,
    token: backendToken,
  };
});

// Get desktop runtime info for diagnostics
ipcMain.handle('get-app-info', () => {
  return {
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    chromeVersion: process.versions.chrome,
    platform: process.platform,
  };
});

// App lifecycle

app.on('ready', async () => {
  // Single instance lock
  const gotLock = app.requestSingleInstanceLock();

  if (!gotLock) {
    console.log('Another instance is already running. Quitting.');
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  // Generate session token
  backendToken = generateToken();

  // Keep the backend data root aligned with Electron's isolated user data.
  const userDataDir = sandboxUserDataDir;

  // Start Python backend
  pythonService = new PythonService({
    token: backendToken,
    dataDir: userDataDir,
  });

  try {
    const url = await pythonService.start();
    backendUrl = url;
    console.log(`Backend ready at ${backendUrl}`);
  } catch (error) {
    console.error('Failed to start backend:', error);
    // Continue anyway - UI will show backend unavailable
  }

  // Create window
  createWindow();
});

app.on('window-all-closed', () => {
  // On macOS, keep app running until explicit quit
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', async (event) => {
  if (isQuitting && pythonService) {
    // Already confirmed quit, shutdown backend
    event.preventDefault();

    try {
      await pythonService.shutdown(backendUrl, backendToken);
    } catch (error) {
      console.error('Error during backend shutdown:', error);
    }

    // Allow quit to proceed
    process.nextTick(() => {
      isQuitting = false; // Reset to avoid infinite loop
      app.quit();
    });
  }
});

app.on('will-quit', () => {
  // Final cleanup
  if (pythonService) {
    pythonService.kill();
  }
});
