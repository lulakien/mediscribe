# MediScribe Agent Guide

This repository is the local-first MediScribe desktop app described in `DESIGN.md`. Treat `DESIGN.md` as the product contract and the Gradio prototype as the behavioral reference for transcription output. Keep changes narrow, repo-grounded, and compatibility-preserving.

## Current Shape

- `shared/transcribe_core.py` is the durable transcription engine. It owns audio collection, metadata probing, Whisper execution, output naming, per-file writes, run logs, and `manifest.csv` / `manifest.json`.
- `prototype_gradio/` is preserved as the working reference app. Do not rewrite it while making desktop fixes unless the user explicitly asks.
- `desktop/backend/` is the FastAPI wrapper around shared core logic. It exposes settings, file inspection, output-folder validation, model management, job management, WebSocket progress, and manifest-backed results.
- `desktop/frontend/` is the React/Vite renderer. It talks to the backend through HTTP/WebSocket and to Electron only through the minimal preload bridge.
- `desktop/electron/` starts the Python backend, owns native file/folder dialogs, shell open/reveal actions, and provides backend connection info.
- `docs/` holds supporting docs. Files under `docs/status/` are historical reports; verify current state with commands before trusting them.

## Design Boundaries

- Do not broaden scope beyond `DESIGN.md` without a direct user request.
- Keep the renderer sandboxed. Business logic must go through FastAPI. Electron IPC should stay limited to native dialogs, shell operations, and backend connection info.
- Manifests are the source of truth for completed history. Avoid introducing a parallel persistent result store unless the design is reopened.
- Preserve the output contract from `shared/transcribe_core.py`: TXT, timestamped MD, segments JSON, manifest CSV/JSON, and run logs.
- Non-local transcription backends are future placeholders. Do not implement cloud/API transcription unless explicitly asked.
- Historical docs may mention earlier failures. Prefer fixing stale wording over changing code to match outdated reports.

## Python Environment

Use the backend virtual environment:

```bash
cd /home/eren/Desktop/code-projects/mediscribe
python -m venv desktop/backend/.venv
desktop/backend/.venv/bin/pip install -r desktop/backend/requirements.txt
```

The root `pyrightconfig.json` points Pyright/Pylance at `desktop/backend/.venv`, `shared`, and `desktop/backend`. If imports look broken in the IDE, select `desktop/backend/.venv/bin/python` as the interpreter and reload Pylance.

The backend no longer imports `torch`. CUDA availability checks should use `ctranslate2`, for example:

```bash
desktop/backend/.venv/bin/python -c "import ctranslate2; print(ctranslate2.get_cuda_device_count())"
```

## Verification Commands

From the repository root:

```bash
npx pyright --project pyrightconfig.json
```

Backend:

```bash
cd desktop/backend
. .venv/bin/activate
pytest -q
python -m py_compile *.py ../../shared/transcribe_core.py
```

Frontend and Electron:

```bash
cd desktop
npm run build:all
```

Packaging:

```bash
cd desktop
npm run package
```

Backend smoke check:

```bash
cd desktop/backend
. .venv/bin/activate
MEDISCRIBE_TOKEN=dev-smoke uvicorn main:app --host 127.0.0.1 --port 0
```

Then query `/health`, `/models`, and `/results` with the bearer token shown by the service setup. Use an explicit fixed port if the shell does not expose the ephemeral port clearly.

## Important Runtime Contracts

- `POST /files/inspect` receives absolute file paths from Electron file picker and returns supported and unsupported rows.
- `POST /jobs` requires `file_paths`, resolved transcription `options`, `output_folder`, and optional `normalize_audio`, `overwrite`, and `dry_run`.
- `GET /jobs`, `GET /jobs/{id}`, and `POST /jobs/{id}/cancel` are live in-memory job APIs.
- `GET /jobs/{id}/result` resolves a completed live job to its manifest output for the renderer preview.
- `GET /results` and `GET /results/preview?path=...` read durable manifest/output files.
- The frontend should not send an empty output folder. It should use Settings defaults or a folder selected through Electron.
- The Electron close guard expects the backend `/jobs` response shape `{ jobs: [...] }`.

## Known Environment Notes

- GPU/CUDA may be unavailable because of host driver state. That is an external runtime condition, not automatically a repo bug.
- Full-scale transcription requires local model availability and working `ffmpeg`/`ffprobe`.
- Build warnings about large Vite chunks are non-fatal unless the user asks for bundle optimization.
- `.vscode/` and `desktop/backend/.venv/` are local/ignored environment state.

## Documentation Layout

- `DESIGN.md`: authoritative product/design contract.
- `docs/README.md`: index for current documentation.
- `docs/QUICK_START.md`: setup and first-run guide.
- `desktop/README.md`: desktop app overview.
- `docs/backend/`: backend/model-manager implementation notes.
- `docs/desktop/`: packaging and build setup notes.
- `docs/frontend/`: UI setup notes.
- `docs/status/`: historical reports only.

## Editing Guidance

- Use `rg` for searches.
- Keep edits focused to the broken seam being fixed.
- Prefer existing hooks, API client, config manager, job manager, and shared core helpers.
- Do not hide test failures by weakening assertions or changing historical baselines.
- When a backend endpoint is missing for an existing UI call, either add the narrow endpoint backed by existing data or rewire the UI to an existing endpoint. Do not add a second source of truth.
- Before declaring completion, run the smallest relevant checks and then `npm run build:all` plus backend tests when the change crosses frontend/backend boundaries.
