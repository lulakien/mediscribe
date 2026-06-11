# MediScribe Desktop

Local-first transcription studio for Turkish medical lectures.

## Overview

MediScribe Local transcribes medical lectures on your machine using Whisper AI. Everything runs locally with GPU acceleration — private, secure, and study-ready outputs.

## Features

- **Local-first**: Audio never leaves your machine
- **GPU-accelerated**: Uses CUDA for fast transcription (CPU fallback available)
- **Study-ready outputs**: TXT, timestamped Markdown, segments JSON
- **Model management**: Download and test Whisper models with one click
- **Batch processing**: Process multiple audio files with smart presets

---

## System Requirements

### Prerequisites

- **Operating System**: Ubuntu 24.04+ or compatible Linux distribution
- **Node.js**: 18+ (for development and building)
- **Python**: 3.10 or 3.11 (required for transcription backend)
- **ffmpeg**: System package for audio processing
- **CUDA Drivers**: NVIDIA GPU driver 525+ (optional, for GPU acceleration)

### Hardware Recommendations

- **GPU**: NVIDIA GPU with 8GB+ VRAM for best performance
  - Tested: RTX 4070 Mobile (8GB VRAM)
  - Models: `large-v3` requires ~3.1GB VRAM with float16
  - CPU-only mode available as fallback
- **RAM**: 16GB+ recommended (32GB for large batch processing)
- **Disk Space**: 10GB+ free space
  - Whisper models: 0.5GB (small) to 3.1GB (large-v3)
  - Output storage depends on your audio library

---

## Installation

### Option 1: AppImage (Universal Linux)

The AppImage runs on any modern Linux distribution without installation.

1. **Download** `MediScribe-1.0.0-x64.AppImage` from releases
2. **Make it executable**:
   ```bash
   chmod +x MediScribe-1.0.0-x64.AppImage
   ```
3. **Install ffmpeg** if not already present:
   ```bash
   sudo apt install ffmpeg
   ```
4. **Run the app**:
   ```bash
   ./MediScribe-1.0.0-x64.AppImage
   ```

**Note**: Ubuntu 22.04+ may require libfuse2:
```bash
sudo apt install libfuse2
```

### Option 2: Debian/Ubuntu Package (.deb)

The .deb package integrates with your system and auto-installs dependencies.

```bash
# Install the package
sudo dpkg -i mediscribe_1.0.0_amd64.deb

# Install dependencies (ffmpeg)
sudo apt install -f

# Launch from terminal
mediscribe

# Or find "MediScribe" in your application menu
```

### GPU Acceleration Setup (Recommended)

For NVIDIA GPU acceleration:

1. **Install NVIDIA drivers**:
   ```bash
   # Auto-detect and install recommended driver
   sudo ubuntu-drivers autoinstall
   
   # Or install a specific version
   sudo apt install nvidia-driver-535
   ```

2. **Reboot** your system:
   ```bash
   sudo reboot
   ```

3. **Verify GPU is detected**:
   ```bash
   nvidia-smi
   ```
   You should see your GPU model and driver version.

4. **Launch MediScribe** — it will automatically detect and use CUDA.

The app shows GPU status in the footer: "CUDA: ready" or "CPU only".

---

## Development Setup

### 1. Install Prerequisites

```bash
# Node.js 18+ (using nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18

# Python 3.10+
sudo apt install python3.10 python3.10-venv python3-pip

# ffmpeg
sudo apt install ffmpeg

# Verify installations
node --version    # Should be 18+
python3 --version # Should be 3.10 or 3.11
ffmpeg -version   # Should show ffmpeg version
```

### 2. Clone and Navigate

```bash
cd /path/to/mediscribe/desktop
```

### 3. Install Dependencies

#### Frontend and Electron (npm workspaces)

```bash
# Install all workspace dependencies from root
npm install

# This installs:
# - Root workspace management
# - frontend/ dependencies (React, Vite, Tailwind)
# - electron/ dependencies (Electron, TypeScript)
```

#### Backend (Python)

```bash
cd backend

# Create virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Verify key packages
pip list | grep -E "fastapi|faster-whisper|uvicorn"
```

**Backend dependencies installed**:
- `fastapi` - REST API framework
- `uvicorn` - ASGI server
- `faster-whisper` - Whisper inference engine
- `huggingface-hub` - Model downloading
- `pyyaml` - Config management

---

## Running in Development Mode

You need **three separate terminal windows** running concurrently.

### Terminal 1: Backend (FastAPI)

```bash
cd /path/to/mediscribe/desktop/backend

# Activate virtual environment if using one
source venv/bin/activate

# Start the FastAPI backend
python3 -m uvicorn main:app --reload --port 8000
```

**Expected output**:
```
INFO:     Started server process
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

The backend provides:
- REST API at `http://localhost:8000`
- WebSocket events at `ws://localhost:8000/ws/events`
- API docs at `http://localhost:8000/docs`

### Terminal 2: Frontend (Vite Dev Server)

```bash
cd /path/to/mediscribe/desktop/frontend

# Start Vite development server
npm run dev
```

**Expected output**:
```
VITE v5.x.x  ready in X ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

The frontend dev server provides:
- Hot module replacement (HMR) for instant updates
- React component development at `http://localhost:5173`
- Vite serves the UI during development

### Terminal 3: Electron

```bash
cd /path/to/mediscribe/desktop/electron

# Compile TypeScript in watch mode (keeps running)
npm run watch
```

Wait for "Watching for file changes." message, then **open a new terminal tab**:

```bash
cd /path/to/mediscribe/desktop/electron

# Launch Electron window
npm start
```

**What happens**:
- Electron main process starts
- Loads frontend from Vite dev server (`http://localhost:5173`)
- Connects to backend API (`http://localhost:8000`)
- Opens the MediScribe desktop window

**Development workflow**:
- Edit React components in `frontend/src/` → HMR updates instantly
- Edit Electron code in `electron/src/` → restart `npm start`
- Edit backend code in `backend/` → uvicorn auto-reloads

---

## Production Build

### Build All Components

From the desktop root directory:

```bash
cd /path/to/mediscribe/desktop

# Run the full build pipeline
npm run build:all
```

This runs:
1. `npm run build:frontend` → Compiles React app to `frontend/dist/`
2. `npm run build:electron` → Compiles TypeScript to `electron/dist/`
3. `npm run build:backend` → No-op (Python is interpreted)

### Package the Application

After building, create distributable packages:

```bash
cd /path/to/mediscribe/desktop/electron

# Package for Linux (AppImage + .deb)
npm run package:linux
```

**Output** in `electron/dist-packaged/`:
- `MediScribe-1.0.0-x64.AppImage` (universal Linux)
- `mediscribe_1.0.0_amd64.deb` (Debian/Ubuntu package)

### Individual Build Commands

```bash
# Build frontend only
cd frontend
npm run build
# Output: frontend/dist/

# Build electron only
cd electron
npm run build
# Output: electron/dist/

# Package without rebuilding (faster iteration)
cd electron
npm run package:linux
```

### What Gets Bundled

The packaged app includes:
- Electron main process (compiled from `electron/src/`)
- React frontend (static build from `frontend/dist/`)
- Python backend code (`backend/*.py`)
- Python dependencies (installed at build time)

The packaged app does **NOT** include:
- Python runtime (uses system `python3`)
- ffmpeg (system package, documented as dependency)
- NVIDIA drivers (system package)
- Whisper models (downloaded on first use to `~/.cache/huggingface/`)

---

## Project Structure

```
desktop/
├── package.json              # Workspace root (npm workspaces)
├── README.md                 # This file
├── ../DESIGN.md              # Architecture specification
├── ../docs/desktop/PACKAGING.md
├── ../docs/desktop/BUILD_SETUP_SUMMARY.md
│
├── frontend/                 # React + Vite + Tailwind UI
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/            # Route pages (Transcribe, Models, Results, etc.)
│   │   ├── lib/              # Utilities, API clients, state management
│   │   └── App.tsx           # Main app component
│   ├── public/               # Static assets
│   ├── dist/                 # Build output (created by `npm run build`)
│   ├── package.json          # Frontend dependencies
│   ├── vite.config.ts        # Vite configuration
│   ├── tailwind.config.js    # Tailwind CSS configuration
│   └── tsconfig.json         # TypeScript configuration
│
├── electron/                 # Electron main process
│   ├── src/
│   │   ├── main.ts           # Electron app lifecycle, window management
│   │   ├── preload.ts        # Secure IPC bridge (window.mediscribe API)
│   │   └── python-service.ts # Backend subprocess supervisor
│   ├── dist/                 # Compiled JavaScript (created by `npm run build`)
│   ├── dist-packaged/        # Final packages (created by `npm run package`)
│   ├── build/                # electron-builder resources
│   │   ├── icon.png          # App icon
│   │   └── after-install.sh  # .deb post-install script
│   ├── package.json          # Electron config + electron-builder settings
│   └── tsconfig.json         # TypeScript configuration
│
└── backend/                  # FastAPI + transcription core
    ├── main.py               # FastAPI app, routes, WebSocket, auth
    ├── job_manager.py        # Transcription job queue and worker thread
    ├── model_manager.py      # Whisper model download/test/delete
    ├── file_manager.py       # Output manifest and file operations
    ├── config_manager.py     # User settings persistence (config.json)
    ├── requirements.txt      # Python dependencies
    └── test_*.py             # Unit tests (not bundled in package)
```

### Architecture Overview

**Three-process model** (per DESIGN.md §9):

1. **Electron main process** (Node.js)
   - Window lifecycle and native dialogs
   - Supervises Python backend as subprocess
   - Provides secure IPC via preload (`window.mediscribe` API)

2. **Renderer process** (React + Vite)
   - UI components and routing (React Router)
   - State management (TanStack Query + Zustand)
   - Communicates with backend via HTTP/WebSocket

3. **Python backend** (FastAPI + uvicorn)
   - Wraps `transcribe_core.py` (reused from prototype)
   - REST API + WebSocket for job progress events
   - Model/job/config managers

**Communication flow**:
- Renderer ↔ Backend: HTTP REST + WebSocket (port 8000 in dev, ephemeral in production)
- Renderer ↔ Main: IPC via preload (`window.mediscribe.pickFiles()`, etc.)
- Main ↔ Backend: Subprocess management (spawn, health checks, graceful shutdown)

---

## Known Limitations (v1)

Per DESIGN.md §16, these are known constraints in the current version:

1. **No mid-file cancellation**: The "Cancel" button stops after the current file completes. Files being transcribed cannot be interrupted mid-process. This preserves the reused transcription core without modification.

2. **English UI only**: All interface text is in English. Transcript content remains Turkish (the audio language). Screen readers will correctly pronounce Turkish in transcript previews (`lang="tr"` attribute is set).

3. **Manifest-based results indexing**: The Results page reads from output folder manifests (`manifest.json`). No database indexing. Performance is excellent for typical use (hundreds of files), but not optimized for tens of thousands of files across many output folders.

4. **No real-time transcription**: The app processes pre-recorded audio files only. Live microphone transcription is not supported.

5. **No in-app transcript editing**: Transcripts are view-only in the app. Use external text editors to modify output files (TXT, MD, JSON).

6. **System Python required**: The app uses the system Python 3.10+ installation. It does not bundle a Python runtime. (This simplifies packaging and avoids conflicts with CUDA libraries.)

7. **CUDA detection only at startup**: GPU availability is checked when the backend starts. Hot-plugging GPUs or driver updates require app restart.

8. **Stop-after-current-file cancellation**: Once a transcription job is running, cancellation waits for the current file to complete before stopping. Long files (multi-hour lectures) cannot be interrupted mid-transcription.

---

## Configuration and Data Locations

### User Data

- **Config file**: `~/.config/mediscribe/config.json`
  - Default output folder
  - Default model and preset
  - UI preferences (theme, welcome screen)
  - Advanced settings (language, initial prompt)

- **Backend logs**: Console output (printed to terminal in dev mode)
  - In production: accessible via journalctl (systemd) or console

- **Model cache**: `~/.cache/huggingface/hub/`
  - Managed by Hugging Face Hub library
  - Shared with other applications using HF models
  - Models: `Systran/faster-whisper-large-v3`, etc.

- **Default output folder**: `~/Documents/MediScribe/`
  - Each transcription run creates:
    - `output/<original_filename>.txt` (timestamp-free transcript)
    - `output/<original_filename>.md` (timestamped transcript)
    - `output/<original_filename>_segments.json` (full segment data)
    - `output/manifests/manifest.json` and `manifest.csv` (run metadata)
    - `output/logs/run.log` (per-run transcription log)

---

## Testing

### Backend Tests

```bash
cd backend
source venv/bin/activate  # if using venv

# Run all tests
pytest

# Run specific test file
pytest test_job_manager.py -v

# Run with coverage
pytest --cov=. --cov-report=html
```

### Type Checking

```bash
# Frontend
cd frontend
npx tsc --noEmit
# Note: Some type errors exist (see VERIFICATION_REPORT.md)

# Electron
cd electron
npx tsc --noEmit
# Should pass with no errors
```

### Manual Testing Checklist

Before releasing a build:

1. **First launch**: Welcome screen animation, "Enter workspace" CTA
2. **Model download**: Download `small` model, verify progress, test on CUDA
3. **Transcription**: Add audio files, select preset, run transcription
4. **Progress tracking**: Live counters, queue status, completion summary
5. **Results preview**: View TXT/MD tabs, copy paths, reveal in file manager
6. **Settings persistence**: Change defaults, restart app, verify saved
7. **GPU fallback**: Disable GPU (in code or settings), verify CPU mode works
8. **Cancellation**: Start long job, cancel, verify stops after current file

---

## Troubleshooting

### Backend won't start

**Symptom**: "Backend: not ready" in status footer

```bash
# Check Python version
python3 --version
# Must be 3.10 or 3.11

# Check if port 8000 is in use
lsof -i :8000
# Kill process if needed: kill -9 <PID>

# Check backend dependencies
cd backend
pip list | grep -E "fastapi|faster-whisper|uvicorn"
# Reinstall if missing: pip install -r requirements.txt

# Run backend manually to see errors
cd backend
python3 -m uvicorn main:app --reload --port 8000
```

### Frontend build fails

**Symptom**: `npm run build` errors in frontend

```bash
# Clear node_modules and reinstall
cd frontend
rm -rf node_modules package-lock.json
npm install

# Check Node.js version
node --version
# Must be 18+

# Try building with verbose output
npm run build --verbose
```

### GPU not detected

**Symptom**: Status footer shows "CPU only" instead of "CUDA: ready"

```bash
# Verify NVIDIA driver is installed
nvidia-smi
# Should show GPU model and driver version

# Check CUDA is available to Python
python3 -c "import ctranslate2; print(ctranslate2.get_cuda_device_count() > 0)"
# Should print: True

# Check faster-whisper can detect CUDA
python3 -c "from faster_whisper import WhisperModel; print('CUDA available')"

# Restart app after driver installation
# GPU detection happens at backend startup only
```

### Model download fails

**Symptom**: Download progress stalls or errors

```bash
# Check internet connection
ping huggingface.co

# Check disk space in cache directory
df -h ~/.cache/huggingface/
# Need 3-4GB free for large-v3

# Verify Hugging Face is accessible
curl -I https://huggingface.co
# Should return HTTP 200

# Try downloading model manually (for debugging)
python3 -c "from huggingface_hub import snapshot_download; snapshot_download('Systran/faster-whisper-small')"
```

### AppImage won't run

**Symptom**: Double-click does nothing or permission error

```bash
# Make executable
chmod +x MediScribe-1.0.0-x64.AppImage

# Check for FUSE (required on Ubuntu 22.04+)
sudo apt install libfuse2

# Try running from terminal to see errors
./MediScribe-1.0.0-x64.AppImage

# Extract and run directly (if FUSE unavailable)
./MediScribe-1.0.0-x64.AppImage --appimage-extract
cd squashfs-root
./mediscribe
```

### Transcription fails immediately

**Symptom**: Job starts but fails on first file

```bash
# Check ffmpeg is installed
ffmpeg -version
# Install if missing: sudo apt install ffmpeg

# Verify audio file is supported
ffprobe your-audio-file.mp3
# Should show codec, duration, sample rate

# Check backend logs for error details
# In dev: look at terminal running uvicorn
# In production: check Advanced → Logs page in app

# Common issues:
# - Corrupted audio file → try different file
# - Unsupported codec → convert with: ffmpeg -i input.opus output.mp3
# - Model not installed → download from Models page
```

### Out of Memory (CUDA OOM)

**Symptom**: Job fails with "CUDA out of memory"

The app automatically retries with lower precision (`float16 → int8_float16`). If it still fails:

1. **Use a smaller model**:
   - Switch from `large-v3` → `large-v3-turbo` or `medium`
   - Go to Settings → change default model

2. **Use the "Low VRAM Safe" preset**:
   - Automatically uses `int8_float16` compute type
   - Reduces memory usage with minimal quality impact

3. **Free GPU memory**:
   ```bash
   # Check GPU memory usage
   nvidia-smi
   
   # Close other GPU applications (browsers, games, etc.)
   # Restart app to clear any leaked CUDA contexts
   ```

4. **Use CPU fallback**:
   - Settings → Advanced → Device: CPU
   - Slower but works without GPU

---

## Privacy

MediScribe Local is **private by design** (per DESIGN.md §12):

- ✓ All transcription happens on your machine
- ✓ Audio files are never uploaded anywhere
- ✓ Network used **only** for downloading Whisper models from Hugging Face
- ✓ No telemetry, no analytics, no crash reporting
- ✓ No accounts, no API keys required for local models
- ✓ Backend binds to `127.0.0.1` only (not accessible from network)

The status footer shows: **● Local mode · Backend: running · CUDA: ready**

---

## Support and Documentation

- **Architecture**: See `DESIGN.md` for detailed design decisions and specifications
- **Packaging**: See `../docs/desktop/PACKAGING.md` for electron-builder configuration details
- **Build System**: See `../docs/desktop/BUILD_SETUP_SUMMARY.md` for workspace setup
- **Issues**: Report bugs and request features on GitHub

---

## License

MIT License - see `LICENSE` file for details.

---

## Contributing

Contributions are welcome! Please:

1. Read `DESIGN.md` to understand architecture constraints
2. Follow the existing code style (TypeScript/Python conventions)
3. Test on Ubuntu 24.04 with GPU if making transcription changes
4. Update this README if adding new setup steps or requirements

---

## Credits

- **Whisper AI**: OpenAI's Whisper model for speech recognition
- **faster-whisper**: CTranslate2-based efficient Whisper implementation
- **Electron**: Cross-platform desktop framework
- **React + Vite**: Modern UI development stack
- **FastAPI**: High-performance Python web framework
