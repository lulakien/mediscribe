# MediScribe Desktop - Quick Start Guide

## Current Status

✅ **Buildable** - Core implementation is present, frontend/Electron builds pass, and Linux packages can be produced. Backend runtime setup still needs system libav development packages before dependency installation and live transcription testing.

Current backend dependency setup has been updated for Python 3.14. The project venv at `desktop/backend/.venv` resolves `ctranslate2`, `faster_whisper`, and FastAPI dependencies. If your IDE still shows unresolved imports, reload the Python language server and select `desktop/backend/.venv/bin/python`.

## What's Working

- ✅ Complete desktop app structure
- ✅ All 7 pages implemented (Welcome, Transcribe, Models, Results, Jobs, Settings, Advanced)
- ✅ Full backend API (FastAPI with job queue, model manager, file manager, config)
- ✅ Electron wrapper with Python backend supervision
- ✅ Design system with warm earth palette
- ✅ Documentation (DESIGN.md, README.md, IMPLEMENTATION_SUMMARY.md)

## What Needs Fixing (In Progress via Workflow)

1. Install missing npm packages
2. Fix TypeScript imports (Framer Motion, icons)
3. Move `transcribe_core.py` to shared location
4. Build frontend for production

## Manual Quick Fix (If You Want to Start Now)

### 1. Install Missing Dependencies

```bash
cd /home/eren/Desktop/code-projects/mediscribe/desktop

# Install missing Radix UI components at workspace root
npm install @radix-ui/react-collapsible @radix-ui/react-label
```

### 2. Fix Import Errors

```bash
cd desktop/frontend/src

# Fix Framer Motion imports (change 'motion/react' to 'framer-motion')
find . -name "*.tsx" -exec sed -i "s/from 'motion\/react'/from 'framer-motion'/g" {} +

# Fix WaveformIcon (change to Activity icon)
find . -name "*.tsx" -exec sed -i 's/WaveformIcon/Activity/g' {} +
```

### 3. Set Up Shared Core

```bash
cd /home/eren/Desktop/code-projects/mediscribe

# Copy core to shared directory
cp prototype_gradio/transcribe_core.py shared/

# Update backend to import from shared (edit desktop/backend/main.py)
# Change: from transcribe_core import ... 
# To: import sys; sys.path.insert(0, '../../shared'); from transcribe_core import ...
```

### 4. Build Frontend

```bash
cd /home/eren/Desktop/code-projects/mediscribe/desktop/frontend
npm run build

# This creates desktop/frontend/dist/ with production build
```

### 5. Install Backend Dependencies

```bash
cd /home/eren/Desktop/code-projects/mediscribe/desktop/backend

# Create virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

## Running in Development Mode

Once the above fixes are applied:

### Terminal 1: Start Backend

```bash
cd /home/eren/Desktop/code-projects/mediscribe/desktop/backend
source venv/bin/activate  # if using venv
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

# Build frontend
cd frontend
npm run build

# Build electron
cd ../electron
npm run build

# Package for Linux
npm run package:linux
```

Output files in `desktop/electron/dist-packaged/`:
- `MediScribe-1.0.0-x64.AppImage` (universal Linux)
- `mediscribe_1.0.0_amd64.deb` (Debian/Ubuntu)

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
sudo dpkg -i mediscribe_*.deb
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
