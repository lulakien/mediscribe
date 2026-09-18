# MediScribe Desktop - Quick Start Guide

## Current Status

✅ **Buildable and packageable** - Core implementation is present, frontend/Electron builds pass, backend tests pass, and Linux packages can be produced.

Current backend dependency setup supports Python 3.10+. On Apple Silicon, the project venv at `desktop/backend/.venv` resolves native `ctranslate2`, `faster_whisper`, and FastAPI wheels. If your IDE still shows unresolved imports, reload the Python language server and select `desktop/backend/.venv/bin/python`.

## macOS sandbox setup

The older `lulakien/mediscribe` app can be run on macOS in development mode.
This checkout uses CPU inference and stores its configuration and model cache
under `~/Library/Application Support/MediScribe Local Sandbox`, so it does not
share runtime state with another MediScribe installation.

```bash
# From the repository root
brew install ffmpeg
python3 -m venv desktop/backend/.venv
desktop/backend/.venv/bin/python -m pip install -r desktop/backend/requirements.txt

cd desktop
npm ci
npm run build:all
```

Start the renderer and Electron in separate terminals:

```bash
# Terminal 1
cd desktop && npm run dev:frontend

# Terminal 2
cd desktop && npm start
```

Electron starts the backend from the project venv. You do not need to start a
third backend terminal for this flow.

## What's Working

- ✅ Complete desktop app structure
- ✅ All 7 pages implemented (Welcome, Transcribe, Models, Results, Jobs, Settings, Advanced)
- ✅ Full backend API (FastAPI with job queue, model manager, file manager, config)
- ✅ Electron wrapper with Python backend supervision
- ✅ Design system with warm earth palette
- ✅ Documentation (DESIGN.md, README.md, IMPLEMENTATION_SUMMARY.md)

## Daily Launch

After installing the Debian/Ubuntu package, launch MediScribe from the terminal with:

```bash
mediscribe
```

You can also launch "MediScribe" from the desktop application menu.

## Development Setup

### 1. Install Backend Dependencies

```bash
cd /home/eren/Desktop/code-projects/mediscribe/desktop/backend

# Create virtual environment (recommended)
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Install Desktop Dependencies

```bash
cd /home/eren/Desktop/code-projects/mediscribe/desktop
npm install
```

## Running in Development Mode

### Terminal 1: Start Backend

```bash
cd /home/eren/Desktop/code-projects/mediscribe/desktop/backend
source .venv/bin/activate
export MEDISCRIBE_PORT=8000
export MEDISCRIBE_TOKEN=dev-token-12345
export MEDISCRIBE_DATA_DIR=~/.config/mediscribe
python3 -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Expected output:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
READY port=8000
```

### Terminal 2: Start Frontend Dev Server

```bash
cd /home/eren/Desktop/code-projects/mediscribe/desktop/frontend
npm run dev
```

Expected output:
```
VITE v5.x.x  ready in 500 ms
➜  Local:   http://localhost:5173/
```

### Terminal 3: Start Electron

```bash
cd /home/eren/Desktop/code-projects/mediscribe/desktop/electron
npm start
```

The Electron window should open and connect to the backend.

## Testing the App

### 1. First Launch

1. Welcome screen should appear with animation
2. Click "Enter workspace"
3. You'll see the Transcribe page

### 2. Download a Model

1. Navigate to Models page (sidebar)
2. Click "Download" on `small` model (fastest for testing, ~500 MB)
3. Wait for download to complete
4. Click "Test on CUDA" (if you have GPU) or just proceed
5. Click "Set as default"

### 3. Transcribe a Test File

1. Go back to Transcribe page
2. Click "Add audio files" or drag audio file
3. Select preset: "Fast Batch" (for testing)
4. Click "Start transcribing"
5. Watch progress in real-time
6. When complete, click "View results"

### 4. View Results

1. Results page shows completed transcriptions
2. Click a result to see transcript preview
3. Try tabs: Text, Timestamped, Segments JSON
4. Click "Open output folder" to see all files

## Building for Production

### Full Build

```bash
cd /home/eren/Desktop/code-projects/mediscribe/desktop

# Build frontend, Electron, and package Linux artifacts
npm run package:linux
```

Output files in `desktop/electron/dist-packaged/`:
- `MediScribe-1.0.0-x86_64.AppImage` (universal Linux)
- `MediScribe-1.0.0-amd64.deb` (Debian/Ubuntu)

### Install the Package

#### AppImage
```bash
cd desktop/electron/dist-packaged
chmod +x MediScribe-*.AppImage
./MediScribe-*.AppImage
```

#### .deb
```bash
cd desktop/electron/dist-packaged
sudo dpkg -i MediScribe-*.deb
sudo apt install -f  # Install dependencies
mediscribe
```

## Troubleshooting

### Backend won't start

```bash
# Check Python version (needs 3.10+)
python3 --version

# Check if dependencies are installed
pip list | grep fastapi

# Check if port is in use
lsof -i :8000
```

### Frontend build fails

```bash
# Clear and reinstall
cd desktop/frontend
rm -rf node_modules package-lock.json
npm install

# Check Node version (needs 20+)
node --version
```

### TypeScript errors

```bash
# Check type errors without building
cd desktop/frontend
npx tsc --noEmit

cd ../electron
npx tsc --noEmit
```

### Electron won't start

```bash
# Rebuild electron
cd desktop/electron
npm run build

# Check if dist/ was created
ls -la dist/
```

### GPU not detected

```bash
# Verify NVIDIA driver
nvidia-smi

# Check CTranslate2 CUDA detection
python3 -c "import ctranslate2; print(ctranslate2.get_cuda_device_count())"

# Install CUDA toolkit if needed
sudo ubuntu-drivers autoinstall
```

## Project Directories

```
mediscribe/
├── DESIGN.md                 ← Complete specification
├── docs/                     ← Project docs and historical reports
├── prototype_gradio/         ← Original Gradio app (working)
├── shared/                   ← Shared transcribe_core.py
└── desktop/                  ← New Electron app
    ├── README.md             ← Detailed docs
    ├── frontend/             ← React UI
    ├── electron/             ← Electron wrapper
    └── backend/              ← FastAPI backend
```

## Next Steps After Quick Start

1. ✅ Get the app running in development mode (above steps)
2. 🧪 Test full transcription workflow with a real audio file
3. 🐛 Fix any runtime errors that appear
4. 📦 Build production package
5. 🚀 Test AppImage on clean system
6. 📝 Document any additional issues

## Key Files to Know

### Configuration
- `desktop/backend/requirements.txt` - Python dependencies
- `desktop/frontend/package.json` - Frontend dependencies
- `desktop/electron/package.json` - Electron + build config
- `prototype_gradio/config.yaml` - Default transcription settings

### Entry Points
- `desktop/backend/main.py` - FastAPI app startup
- `desktop/frontend/src/main.tsx` - React app entry
- `desktop/electron/src/main.ts` - Electron main process
- `desktop/electron/src/preload.ts` - IPC bridge

### Core Logic
- `shared/transcribe_core.py` (or `prototype_gradio/transcribe_core.py`) - ML transcription
- `desktop/backend/job_manager.py` - Queue and worker thread
- `desktop/backend/model_manager.py` - HuggingFace downloads

## Getting Help

1. **Check logs:**
   - Backend: Console output from uvicorn
   - Frontend: Browser DevTools console
   - Electron: DevTools (View → Toggle Developer Tools)

2. **Read documentation:**
   - `DESIGN.md` - Architecture and decisions
   - `desktop/README.md` - Installation and usage
   - `docs/desktop/PACKAGING.md` - Build configuration

3. **Verify implementation:**
   - `docs/status/IMPLEMENTATION_SUMMARY.md` - Historical implementation summary
   - `docs/backend/IMPLEMENTATION_SUMMARY.md` - Backend details

## Development Tips

### Hot Reload
- Backend: `--reload` flag on uvicorn (changes apply automatically)
- Frontend: Vite dev server (instant HMR)
- Electron: Restart needed for main process changes

### Debug Mode
```bash
# Enable debug logging in backend
export LOG_LEVEL=DEBUG
python3 -m uvicorn main:app --reload --log-level debug

# Open DevTools in Electron automatically
# Edit electron/src/main.ts, add: win.webContents.openDevTools()
```

### Quick Iteration
```bash
# Only rebuild what changed
cd frontend && npm run build  # Just frontend
cd electron && npm run build  # Just electron

# Skip type checking for fast builds
cd frontend && npm run build -- --mode development
```

## Status Indicators

When app is running correctly, you should see:

**Status Footer (bottom of app):**
- ● Local mode (green dot)
- Backend: running
- CUDA: ready (or "CPU only")
- Default model: small (or whichever you set)

**Health Check:**
```bash
# Backend health endpoint
curl http://localhost:8000/health

# Should return: {"status":"healthy","version":"1.0.0"}
```

---

**Remember:** The fix workflow is currently running in parallel to address these issues automatically. You can either wait for it to complete or apply the manual fixes above to start immediately.

Good luck! 🚀
