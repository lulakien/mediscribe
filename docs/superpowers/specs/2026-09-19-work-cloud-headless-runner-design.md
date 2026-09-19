# ChatGPT Work and Cross-Platform Headless Runner Design

**Date:** 2026-09-19

**Status:** Approved by the user for implementation

## Goal

Make the Lulakien MediScribe repository usable in two intentionally separate
modes: the existing desktop application for the user on a supported local
computer, and a portable headless workflow that ChatGPT Work agents can clone,
bootstrap, run, resume, and collect without a desktop GUI, macOS Keychain, or
Apple MLX runtime.

## Context and constraints

- `shared/transcribe_core.py` is the provider-neutral transcription engine and
  already owns audio collection, provider resolution, transcription, output
  writing, manifests, and run logs.
- `desktop/` is the Electron/React/FastAPI application and must remain the
  preferred interactive path for the user.
- Apple MLX is an optional Apple-Silicon local backend. It must remain
  conditional and must not be required by a Work Cloud environment.
- Microsoft transcription is reached through the existing explicit OpenRouter
  adapter. A headless run must read the API key from an environment variable
  and must never write it to a config file, manifest, log, or generated
  artifact.
- The repository must remain free of audio, transcripts, API keys, personal
  paths, and provider response bodies.
- Existing TXT, timestamped Markdown, segments JSON, manifest CSV/JSON, and
  run-log output contracts remain authoritative.
- The desktop default remains local-first. Cloud transcription stays an
  explicit choice.

## Alternatives considered

### Portable headless runner over the shared core — selected

Add a small Python CLI and environment doctor that call the existing shared
engine directly. This keeps one transcription/output implementation, avoids
Electron and Keychain dependencies in Work Cloud, works on ordinary local
terminals, and can be tested in Linux CI without a real provider key.

### Docker-only execution

This would make dependency isolation explicit, but Docker availability is not
guaranteed in hosted agent sandboxes. It would also add a second operational
layer before the basic headless workflow is useful. Docker is out of scope for
this implementation and is not part of the primary contract.

### Headless FastAPI/Electron reuse

Starting the existing backend without its renderer would reuse more desktop
code, but it would introduce a long-running service and UI-oriented API
requirements for a batch task. It would make credential and artifact handling
less direct than a CLI while adding no value for agents.

## Architecture

### Desktop mode

The existing Electron application, FastAPI backend, frontend, model manager,
Keychain integration, and Apple MLX selection remain in place. No desktop
workflow depends on the new headless entry point.

### Headless mode

The new runner will be `scripts/mediscribe_headless.py`. It will:

1. parse explicit input/output and provider options;
2. resolve a cloud or local `TranscriptionOptions` value;
3. call `run_batch()` from `shared/transcribe_core.py`;
4. stream concise progress to the terminal without printing credentials;
5. return a non-zero exit code when any file fails or the environment is
   invalid; and
6. leave the shared engine responsible for per-file outputs, manifests,
   resumption, and logs.

The runner will support these profiles:

- `cloud`: `openrouter_transcribe` with Microsoft `microsoft/mai-transcribe-2`
  by default, `OPENROUTER_API_KEY` from the environment, and no local model
  download;
- `local`: existing `faster-whisper` behavior with CPU/GPU auto-selection;
- `mlx`: not exposed as a Work Cloud requirement; the desktop app continues to
  select it automatically on Apple Silicon when installed.

The runner will not silently fall back from cloud to local transcription. A
missing key, disabled network, provider error, or missing `ffmpeg` will be
reported as a failed run so the resulting manifest cannot be mistaken for a
complete cloud transcription.

### Environment bootstrap and doctor

- `requirements-headless.txt` will contain only portable Python dependencies
  needed by the headless engine and cloud path. Apple MLX, Electron, Keychain,
  and frontend packages will not be required.
- `scripts/bootstrap_headless.py` will create or reuse a repository-local
  `.venv-headless` environment and install the pinned headless requirements.
- `scripts/mediscribe_doctor.py` will perform non-secret checks for Python,
  required imports, `ffmpeg`, `ffprobe`, input/output paths, selected backend,
  API-key presence, and optional network reachability. It will report a key as
  configured without printing its value.
- Bootstrap and doctor commands will be Python-based so they work from
  Windows, macOS, Linux, and a hosted Work shell without depending on Bash.

### Inputs and outputs

The runbook will use a simple staging convention:

```text
work/input/       audio supplied by the user, project, Library, or connector
work/output/      generated MediScribe artifacts
```

The runner will accept arbitrary explicit paths as well, so agents can work
with files staged by an authorized connector. The output folder will contain
the existing per-file directories plus `manifests/`, `logs/`, and `temp/`.
The manifest is the source of truth for resume and audit decisions.

### Documentation and CI

- `docs/WORK_CLOUD_RUNBOOK.md` will document clone, bootstrap, doctor, cloud
  configuration, dry-run, transcription, resume, and artifact collection.
- `README.md` and `docs/QUICK_START.md` will link to the runbook and make the
  desktop/headless split explicit.
- `AGENTS.md` will document the supported headless path and remove the stale
  restriction that cloud/API transcription is unsupported.
- `.github/workflows/headless.yml` will install portable dependencies and
  `ffmpeg` on Ubuntu, run the doctor in keyless dry-run mode, run headless
  tests, and keep real provider calls out of CI.

## Error handling and safety

- No API key is accepted as a CLI argument, stored in YAML/JSON, or written to
  logs.
- Cloud mode requires an explicitly selected backend and an environment key.
- The doctor distinguishes missing tools, missing imports, missing keys, and
  disabled network access.
- The runner preserves the shared engine's manifest statuses. A run with any
  failed input exits non-zero and reports the failed filenames.
- `--dry-run` performs discovery and output planning without loading a model or
  sending audio.
- Existing output files are skipped unless `--overwrite` is explicitly given.
- No fallback from a failed cloud provider request to local inference is
  performed.

## Verification contract

The implementation is complete only when all of the following are true:

- headless unit tests cover profile resolution, secret-safe diagnostics,
  argument validation, dry-run behavior, and non-zero failure reporting;
- the headless doctor runs successfully in a portable environment with no
  provider key when invoked in dry-run mode;
- the existing backend tests and Python compilation checks pass;
- the existing desktop build passes unchanged;
- the Ubuntu CI workflow is syntactically valid and runs the same keyless
  checks;
- the published branch is verified against the exact remote commit before any
  default-branch update; and
- the update to the repository's default branch is forward-only and contains
  no media or credentials.
