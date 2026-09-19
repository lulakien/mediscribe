# MediScribe Work Cloud and Headless Runbook

This runbook is for ChatGPT Work agents or any terminal without the MediScribe
desktop application. It uses the portable Python runner and keeps the existing
TXT, timestamped Markdown, segments JSON, manifest, and run-log output
contract.

## Choose the execution mode

- Use the [desktop application setup](../README.md#macos-sandbox-development)
  when you have a supported local computer and want the Electron interface,
  local Whisper, or Apple MLX on Apple Silicon.
- Use this runbook when an agent must process files in a hosted or ordinary
  terminal environment. Work Cloud does not inherit a user's local files,
  desktop applications, browser sessions, or Keychain, so inputs and secrets
  must be supplied through an authorized project, file, connector, or
  environment-secret path.

The cloud workflow is explicit. It does not silently fall back to local
transcription if the provider or network fails.

## Requirements

- Python 3.10 or newer
- `ffmpeg` and `ffprobe` on `PATH`
- shell access and public-network access when using the cloud profile
- an authorized `OPENROUTER_API_KEY` environment value for cloud runs
- audio files in a staged input folder or explicit file paths

The cloud profile does not download Whisper models and does not require
Electron, Node.js, macOS Keychain, or Apple MLX.

Install the system audio tools before bootstrapping if they are not already
available. On Debian/Ubuntu-based Work Cloud images, use:

```bash
sudo apt-get update
sudo apt-get install --yes ffmpeg
```

On macOS with Homebrew, use `brew install ffmpeg`. On Windows, install a
trusted FFmpeg distribution and ensure both `ffmpeg` and `ffprobe` are on
`PATH`. Confirm availability from the repository root with:

```bash
ffmpeg -version
ffprobe -version
```

## Bootstrap from a fresh checkout

```bash
git clone https://github.com/lulakien/mediscribe.git
cd mediscribe
python3 scripts/bootstrap_headless.py --profile cloud
```

The bootstrapper creates `.venv-headless` and installs only the portable cloud
requirements. It is safe to run again; an existing environment is reused.

On Windows, the equivalent interpreter path is:

```powershell
.venv-headless\Scripts\python.exe scripts\mediscribe_doctor.py --profile cloud --input work\input --output work\output
```

On Linux and macOS, use:

```bash
.venv-headless/bin/python scripts/mediscribe_doctor.py --profile cloud --input work/input --output work/output
```

## Stage inputs

Keep task data outside the Git-tracked source tree when possible:

```text
work/input/       supplied audio files
work/output/      generated MediScribe artifacts
```

An agent may instead pass one or more explicit `--input` paths. Supported
audio extensions include `.mp3`, `.mpeg`, `.mpga`, `.m4a`, `.wav`, `.flac`,
`.ogg`, `.opus`, and `.webm`.

If files come from Google Drive or another connected application, use the
authorized connection to stage a local working copy first. Do not assume that
an app connection or a browser session is automatically visible to the shell.

## Run the doctor

Normal mode verifies the tools, imports, input/output paths, and cloud key:

```bash
.venv-headless/bin/python scripts/mediscribe_doctor.py \
  --profile cloud \
  --input work/input \
  --output work/output
```

For a keyless CI or environment smoke check, use dry-run mode. A missing key
is reported as a warning there because no audio is sent:

```bash
.venv-headless/bin/python scripts/mediscribe_doctor.py \
  --profile cloud \
  --input work/input \
  --output work/output \
  --dry-run \
  --json
```

The doctor never prints the key value.

## Configure cloud transcription

Provide the key through the environment or the workspace's approved secret
mechanism. Do not pass it as a command-line argument, put it in `config.json`,
write it into a manifest, or paste it into a repository or chat.

The default variable is `OPENROUTER_API_KEY`. The runner also accepts a
different variable name through `--api-key-env` when the workspace secret is
named differently.

The default Microsoft model is:

```text
microsoft/mai-transcribe-2
```

The other supported model is:

```text
microsoft/mai-transcribe-1.5
```

Select it explicitly when needed:

```bash
.venv-headless/bin/python scripts/mediscribe_headless.py \
  --profile cloud \
  --model microsoft/mai-transcribe-1.5 \
  --input work/input \
  --output work/output
```

## Transcribe a batch

After the doctor reports that the environment is ready:

```bash
.venv-headless/bin/python scripts/mediscribe_headless.py \
  --profile cloud \
  --input work/input \
  --output work/output \
  --json-summary
```

For a safe discovery pass that does not load a model or send audio:

```bash
.venv-headless/bin/python scripts/mediscribe_headless.py \
  --profile cloud \
  --input work/input \
  --output work/output \
  --dry-run \
  --json-summary
```

M4A and other provider-incompatible inputs are converted to a temporary
16-kHz mono WAV by `ffmpeg` before the Microsoft request. The original source
files are not modified.

## Resume an interrupted batch

Run the same command again with the same output directory:

```bash
.venv-headless/bin/python scripts/mediscribe_headless.py \
  --profile cloud \
  --input work/input \
  --output work/output
```

Completed output triplets are skipped unless `--overwrite` is supplied. The
manifest at `work/output/manifests/manifest.json` is the source of truth for
completed, skipped, failed, and scan-only rows. A failed provider request is
recorded as failed and produces a non-zero process exit code; it is never
reported as a successful local fallback.

## Output layout

```text
work/output/
├── <safe-source-stem>/
│   ├── transcripts/<safe-source-stem>.txt
│   ├── transcripts/<safe-source-stem>.md
│   └── segments/<safe-source-stem>.segments.json
├── manifests/manifest.csv
├── manifests/manifest.json
├── logs/run.log
└── temp/                    temporary converted audio, cleaned per file
```

The output directory can be uploaded or attached as the artifact of the Work
task. Do not commit it to the repository.

## Local headless mode

For a non-GUI local run using faster-whisper instead of the cloud provider:

```bash
python3 scripts/bootstrap_headless.py --profile local
.venv-headless/bin/python scripts/mediscribe_doctor.py \
  --profile local \
  --input work/input \
  --output work/output
.venv-headless/bin/python scripts/mediscribe_headless.py \
  --profile local \
  --model large-v3 \
  --input work/input \
  --output work/output
```

This downloads the selected faster-whisper model when first used. For the
Apple Silicon MLX path and the interactive workflow, use the desktop setup in
the root README instead.

## Exit codes

- `0`: every discovered row completed, was skipped safely, or was a dry-run
  scan.
- `1`: at least one discovered file failed or was unsupported during the run.
- `2`: invalid invocation or no supported audio files were found.

## Work Cloud permissions and privacy

Work Cloud must have the workspace-approved shell and public-network
permissions needed by the run. A repository checkout alone does not provide
access to a local browser profile, local Keychain, private VPN, or files on a
different computer.

The runner keeps the API key in the process environment, sends audio only when
the cloud profile is explicitly selected, and writes no credential value to
the repository or artifacts. Review the workspace's connected-account and
retention policies before processing sensitive recordings.
