# MediScribe Desktop - Packaging Guide

Complete packaging configuration per DESIGN.md §9.7

## Overview

MediScribe Desktop uses **electron-builder** to create distributable Linux packages:
- **AppImage** (primary): Universal Linux binary, runs on any distro
- **deb** (secondary): Native Ubuntu/Debian package with apt integration

## Build Configuration

### Workspace Structure

```
desktop/
├── package.json              # Workspace root with build scripts
├── frontend/                 # React UI (Vite build)
├── electron/                 # Electron main process
│   ├── package.json          # electron-builder config
│   ├── src/                  # TypeScript source
│   ├── dist/                 # Compiled JS (build output)
│   ├── build/                # electron-builder resources
│   │   ├── icon.png          # App icon (512x512)
│   │   └── after-install.sh  # .deb post-install script
│   └── dist-packaged/        # Final packages
└── backend/                  # FastAPI service
```

### Files Bundled

electron-builder packages these into the final app:

1. **Electron main process**: `electron/dist/` (compiled from TypeScript)
2. **Frontend build**: `frontend/dist/` → `resources/frontend/`
3. **Backend code**: `backend/` → `resources/backend/`
   - Python source files
   - requirements.txt
   - Excludes: tests, `__pycache__`, docs

### Files NOT Bundled (System Dependencies)

- **Python runtime**: Uses system Python 3.10+ or bundled standalone Python
- **ffmpeg/ffprobe**: System packages (`apt install ffmpeg`)
- **NVIDIA drivers**: User-installed drivers
- **CUDA runtime**: Bundled via ctranslate2 pip wheels

## Build Scripts

### From Workspace Root (`desktop/`)

```bash
# Build all components
npm run build:all

# Or build individually
npm run build:frontend    # Vite build → frontend/dist
npm run build:electron    # TypeScript → electron/dist
npm run build:backend     # No-op (Python source used directly)

# Package for Linux
npm run package           # Creates AppImage + deb
npm run package:linux     # Linux-only package shortcut
```

### From Electron Directory (`desktop/electron/`)

```bash
# Package for all Linux targets
npm run package:linux

# Or use electron-builder directly
npx electron-builder --linux appimage
npx electron-builder --linux deb
```

## electron-builder Configuration

Key settings in `desktop/electron/package.json`:

```json
{
  "build": {
    "appId": "com.mediscribe.desktop",
    "productName": "MediScribe",
    "linux": {
      "target": ["AppImage", "deb"],
      "category": "Office;AudioVideo;Utility"
    },
    "extraResources": [
      { "from": "../backend", "to": "backend" },
      { "from": "../frontend/dist", "to": "frontend" }
    ]
  }
}
```

## Linux Targets

### AppImage

- **Pros**: Universal, no installation, no root needed
- **Cons**: No automatic updates, no system integration
- **Use case**: Primary distribution method
- **Size**: ~200-300MB (includes all deps except system libs)

**Usage**:
```bash
chmod +x MediScribe-1.0.0-x86_64.AppImage
./MediScribe-1.0.0-x86_64.AppImage
```

### deb Package

- **Pros**: Native Ubuntu/Debian, apt integration, clean uninstall
- **Cons**: Requires root, Ubuntu-specific
- **Use case**: Ubuntu users who prefer native packages
- **Dependencies**: Declares `ffmpeg` dependency in control file

**Usage**:
```bash
sudo dpkg -i MediScribe-1.0.0-amd64.deb
sudo apt install -f  # Install dependencies
mediscribe           # Launch
```

## Post-Install Script (.deb only)

`build/after-install.sh` runs after .deb installation:
- Installs `/usr/bin/mediscribe` as the normal terminal launcher
- Checks for ffmpeg/ffprobe
- Detects NVIDIA driver
- Provides helpful setup feedback

## Icon Requirements

Place `build/icon.png` (512x512) before packaging:
- Used for application launcher
- Taskbar icon
- Package thumbnails

Design guidelines (per DESIGN.md §3):
- Warm, professional aesthetic
- Terracotta (#B65A2A) and wood (#6B4A2D) colors
- Waveform or study motif

## Build Output

After `npm run package`, find packages in:
```
electron/dist-packaged/
├── MediScribe-1.0.0-x86_64.AppImage
├── MediScribe-1.0.0-amd64.deb
└── linux-unpacked/  (debug directory)
```

After installing the `.deb`, the intended daily launch command is:

```bash
mediscribe
```

## Testing Packages

### AppImage Testing

```bash
# Make executable and run
chmod +x MediScribe-1.0.0-x86_64.AppImage
./MediScribe-1.0.0-x86_64.AppImage

# Extract for inspection
./MediScribe-1.0.0-x86_64.AppImage --appimage-extract
ls squashfs-root/
```

### deb Testing

```bash
# Install
sudo dpkg -i MediScribe-1.0.0-amd64.deb
sudo apt install -f

# Test launch
mediscribe

# Inspect package
dpkg -c MediScribe-1.0.0-amd64.deb  # List contents
dpkg -I MediScribe-1.0.0-amd64.deb  # Show metadata

# Uninstall
sudo apt remove mediscribe
```

## Python Runtime Strategy

Per DESIGN.md §9.3, two options:

### Option 1: System Python (v1 default)
- Uses system Python 3.10+
- Backend dependencies installed via pip (documented)
- Lighter package size

### Option 2: Bundled Python (future)
- Bundle python-build-standalone
- Self-contained, no system Python needed
- Larger package (~50MB extra)

**v1 ships with Option 1**. Document requirements:
```
Python 3.10+
pip install -r backend/requirements.txt
```

## CUDA Dependencies

- ctranslate2 wheels include cuDNN/cuBLAS
- Installed via `pip install ctranslate2[cuda12]`
- NVIDIA driver must be system-installed
- App detects CUDA at runtime, falls back to CPU

## Model and Data Storage

**NOT included in package** (by design):
- Whisper models: `~/.cache/huggingface/`
- User config: `~/.config/mediscribe/`
- Transcription outputs: User-selected folders

This allows:
- App updates without re-downloading models
- User data preserved across versions
- Smaller package size

## Distribution Checklist

Before releasing packages:

- [ ] All builds pass: `npm run build:all`
- [ ] Icon present: `electron/build/icon.png` (512x512)
- [ ] License file: `desktop/LICENSE`
- [ ] Version bumped in all `package.json` files
- [ ] README.md updated with release notes
- [ ] Test AppImage on clean Ubuntu 24.04 VM
- [ ] Test .deb installation and ffmpeg dependency
- [ ] Test GPU detection and CUDA transcription
- [ ] Test CPU-only fallback
- [ ] Verify no bundled secrets or API keys
- [ ] Check package sizes (AppImage ~200-300MB, deb ~150-250MB)

## Troubleshooting

### "Cannot find module" errors
- Run `npm run build:all` before packaging
- Verify `electron/dist/` and `frontend/dist/` exist

### Missing Python dependencies
- App expects system Python + pip-installed deps (v1)
- Document in README: `pip install -r backend/requirements.txt`

### AppImage won't run
- Check architecture: `file MediScribe-*.AppImage` (should be x86-64)
- Try extracting: `./MediScribe-*.AppImage --appimage-extract`
- Check permissions: `chmod +x MediScribe-*.AppImage`

### .deb dependency issues
- ffmpeg declared but might need: `sudo apt install -f`
- Python dependencies must be pip-installed separately

### Large package size
- Expected: 200-300MB for AppImage (includes Electron + Chromium)
- To reduce: enable compression in electron-builder (already set to "normal")
- Models NOT included (downloaded on-demand)

## Future: Auto-Updates

Per DESIGN.md §9.8:
- electron-updater configured but disabled in v1
- Update infrastructure stubbed
- Architecture ready for future activation

No update checks or network calls in v1.

## References

- `../../DESIGN.md` §9.7: Packaging considerations
- `../../DESIGN.md` §9.3: Python bundling strategy
- electron-builder docs: https://www.electron.build/
- AppImage spec: https://appimage.org/
