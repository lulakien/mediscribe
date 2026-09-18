# MediScribe Local

Local-first transcription studio for Turkish medical lectures. Drop in audio files and get study-ready transcripts locally by default, with an explicit optional OpenRouter path for Microsoft transcription.

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

- Linux (Ubuntu 22.04+ or compatible) for the packaged release, or macOS for development
- Python 3.10+
- Node.js 18+
- ffmpeg (`sudo apt install ffmpeg` on Ubuntu, or `brew install ffmpeg` on macOS)
- NVIDIA GPU with CUDA (optional, for acceleration)

### macOS sandbox (development)

The older `lulakien/mediscribe` checkout can run on macOS, including Apple
Silicon. On an Apple Silicon Mac with the MLX runtime installed, the full
quality `large-v3` model uses `mlx-community/whisper-large-v3-mlx`; otherwise
the existing faster-whisper path remains available. The sandbox keeps its
backend configuration and Hugging Face model cache under
`~/Library/Application Support/MediScribe Local Sandbox`, separate from any
other MediScribe installation.

From the repository root:

```bash
brew install ffmpeg
python3 -m venv desktop/backend/.venv
desktop/backend/.venv/bin/python -m pip install -r desktop/backend/requirements.txt

cd desktop
npm ci
npm run build:all
```

For development, start the Vite renderer and Electron in two terminals:

```bash
# Terminal 1
cd desktop
npm run dev:frontend

# Terminal 2
cd desktop
npm start
```

Electron starts the backend from `desktop/backend/.venv`; a separate backend
terminal is not required for this development flow. Choose an output folder in
Settings before starting a transcription. Whisper models are downloaded only
when requested and stay in the sandbox model cache. The full MLX `large-v3`
checkpoint is intentionally not downloaded by the initial setup; use Models →
`large-v3` when you are ready for that download.

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

- **Local-first** — audio stays on your machine by default; optional cloud mode is explicit
- **GPU-accelerated** — CUDA with automatic CPU fallback
- **Batch processing** — multiple files with smart presets (Best Quality, Bad Audio, Fast Batch, Low VRAM)
- **Model management** — download, test, and manage Whisper models from the UI
- **Resumable** — skip already-transcribed files, resume interrupted batches
- **Warm design** — earthy, paper-toned UI built for study, not dashboards

## Models

| Model | Size | Speed | Quality |
|-------|------|-------|---------|
| `large-v3` | ~3.1 GB | MLX on Apple Silicon | Best |
| `large-v3-turbo` | ~1.6 GB | Faster | Near-best |
| `medium` | ~1.5 GB | Fast | Good |
| `small` | ~0.5 GB | Fastest | Draft-quality |

Models are downloaded from Hugging Face on first use. Electron sandbox launches keep them under
`~/Library/Application Support/MediScribe Local Sandbox/huggingface/`; direct backend runs use the
normal Hugging Face cache unless `HF_HOME` is set.

## Privacy

- Local mode keeps transcription on your machine
- OpenRouter mode is opt-in and sends prepared audio to the configured provider
- The OpenRouter API key is stored in this sandbox's macOS Keychain (or read from
  the environment fallback) and never persisted in `config.json`
- No telemetry, no analytics, no crash reporting
- Backend binds to `127.0.0.1` only

## Documentation

- **[DESIGN.md](DESIGN.md)** — full product and architecture specification
- **[desktop/README.md](desktop/README.md)** — desktop app setup, build, and troubleshooting
- **[docs/QUICK_START.md](docs/QUICK_START.md)** — development setup guide
- **[docs/OPENROUTER_TRANSCRIPTION.md](docs/OPENROUTER_TRANSCRIPTION.md)** — optional Microsoft/OpenRouter setup and privacy boundary
- **[prototype_gradio/README.md](prototype_gradio/README.md)** — Gradio prototype usage

## License

MIT
