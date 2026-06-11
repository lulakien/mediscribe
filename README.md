# MediScribe Local

Local-first transcription studio for Turkish medical lectures. Drop in audio files, get study-ready transcripts — all on your own GPU, nothing leaves your machine.

## What it does

MediScribe transcribes Turkish medical lectures using Whisper AI with GPU acceleration. For each audio file it produces:

- **TXT** — clean, timestamp-free transcript for reading
- **Timestamped Markdown** — for review and reference
- **Segments JSON** — structured data for tooling
- **Manifest CSV/JSON** — run metadata and file tracking
- **Run logs** — per-batch transcription details

Supported formats: `.mp3`, `.mpeg`, `.mpga`, `.m4a`, `.wav`, `.flac`, `.ogg`, `.opus`, `.webm`

## Project structure

```
mediscribe/
├── shared/                    # Transcription engine (single source of truth)
│   └── transcribe_core.py
├── desktop/                   # Electron desktop app
│   ├── frontend/              # React + Vite + Tailwind + shadcn/ui
│   ├── electron/              # Electron main process, native dialogs, packaging
│   └── backend/               # FastAPI REST + WebSocket server
├── prototype_gradio/          # Working Gradio prototype (reference implementation)
├── DESIGN.md                  # Product and architecture contract
└── docs/                      # Setup guides and implementation notes
```

## Quick start

### Prerequisites

- Ubuntu 22.04+ (or compatible Linux)
- Python 3.10+
- Node.js 18+
- ffmpeg (`sudo apt install ffmpeg`)
- NVIDIA GPU with CUDA (optional, for acceleration)

### Daily launch

After installing the Debian/Ubuntu package, the normal user launch command is:

```bash
mediscribe
```

The package also installs a "MediScribe" desktop launcher in the application menu.

### Prototype (Gradio)

```bash
cd prototype_gradio
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open `http://127.0.0.1:7860` in your browser.

### Desktop app (development)

```bash
# Backend
cd desktop/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd desktop/frontend
npm install
npm run dev

# Electron (separate terminal)
cd desktop/electron
npm install
npm run watch
# then in another terminal: npm start
```

### Build and package

```bash
cd desktop
npm install
npm run build:all
npm run package:linux
```

Output: `electron/dist-packaged/` (AppImage + .deb). After installing the `.deb`, launch with `mediscribe`.

## Key features

- **Local-first** — audio never leaves your machine, no accounts or API keys
- **GPU-accelerated** — CUDA with automatic CPU fallback
- **Batch processing** — multiple files with smart presets (Best Quality, Bad Audio, Fast Batch, Low VRAM)
- **Model management** — download, test, and manage Whisper models from the UI
- **Resumable** — skip already-transcribed files, resume interrupted batches
- **Warm design** — earthy, paper-toned UI built for study, not dashboards

## Models

| Model | Size | Speed | Quality |
|-------|------|-------|---------|
| `large-v3` | ~3.1 GB | Baseline | Best |
| `large-v3-turbo` | ~1.6 GB | Faster | Near-best |
| `medium` | ~1.5 GB | Fast | Good |
| `small` | ~0.5 GB | Fastest | Draft-quality |

Models are downloaded from Hugging Face on first use to `~/.cache/huggingface/hub/`.

## Privacy

- All transcription runs locally on your machine
- Audio files are never uploaded
- Network is used only for downloading Whisper models
- No telemetry, no analytics, no crash reporting
- Backend binds to `127.0.0.1` only

## Documentation

- **[DESIGN.md](DESIGN.md)** — full product and architecture specification
- **[desktop/README.md](desktop/README.md)** — desktop app setup, build, and troubleshooting
- **[docs/QUICK_START.md](docs/QUICK_START.md)** — development setup guide
- **[prototype_gradio/README.md](prototype_gradio/README.md)** — Gradio prototype usage

## License

MIT
