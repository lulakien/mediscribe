# MediScribe Local Audio Transcriber

MediScribe is a local browser app for batch transcription of Turkish medical lecture audio. It runs on your own Ubuntu machine with open-source/local models through `faster-whisper`.

The default workflow does not use paid APIs, does not upload audio, does not summarize, does not translate, and does not reorder lessons.

## Install On Ubuntu

From the project folder:

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip ffmpeg
cd /home/eren/Desktop/code-projects/mediscribe/audio_transcriber
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

For an NVIDIA RTX 4070 Mobile, install a working NVIDIA driver and CUDA-compatible runtime before using the CUDA option. `faster-whisper` uses CTranslate2 under the hood; if CUDA is unavailable, the app can fall back to CPU, but it will be much slower.

## Launch The UI

```bash
cd /home/eren/Desktop/code-projects/mediscribe/audio_transcriber
source .venv/bin/activate
python app.py
```

Open the local Gradio URL shown in the terminal, usually `http://127.0.0.1:7860`.

After setup, normal use happens in the browser. Recommended workflow:

1. Keep `Input mode` set to `Selected files`.
2. Click `Add audio files`.
3. Select one or more audio files from anywhere on your computer.
4. Confirm they appear in the pending selected files table.
5. Enter the output folder path.
6. Choose the model and runtime settings.
7. Click `Dry-run / scan-only` to inspect files without transcribing.
8. Click `Start transcription` to process files one by one.

Optional folder workflow:

1. Set `Input mode` to `Input folder`.
2. Enter the input folder path containing audio files.
3. Use dry-run or start transcription as usual.

Supported audio extensions are `.mp3`, `.mpeg`, `.mpga`, `.m4a`, `.wav`, `.flac`, `.ogg`, `.opus`, and `.webm`. Original audio files are never modified.

## Recommended First Run Settings

For this machine:

```text
model: large-v3
device: cuda
compute_type: float16
vad_filter: true
beam_size: 5
```

Use `large-v3` when quality matters most. Use `large-v3-turbo` for faster batch runs when you can accept a possible quality tradeoff. `medium` and `small` are fallback options for lower memory use.

If CUDA runs out of memory, try:

```text
compute_type: int8_float16
```

If CUDA is not detected, use:

```text
device: cpu
compute_type: int8
```

## UI Controls

`Input mode`: choose `Selected files` for the recommended direct file picker workflow, or `Input folder` to scan every audio file in a folder.

`Add audio files`: opens the browser file picker. You can select one or many audio files. The app processes the selected paths or Gradio-managed temporary upload paths without moving or deleting your original files.

`Pending selected files`: shows selected filenames, source paths, pending status, and unsupported-extension warnings before a run.

`Input folder path`: fallback folder to scan when `Input mode` is `Input folder`.

`Output folder path`: folder where transcript, JSON, manifest, and log subfolders are created.

`Backend`: `local_whisper` is the only active backend in v1. Other choices are reserved extension points and will show a friendly not-implemented message.

`Model`: choose `large-v3`, `large-v3-turbo`, `medium`, or `small`.

`Device`: `auto`, `cuda`, or `cpu`.

`Compute type`: `auto`, `float16`, `int8_float16`, or `int8`.

`Beam size`: default is `5`.

`VAD`: enables faster-whisper voice activity filtering. Default is on.

`Audio normalization`: creates a temporary 16 kHz mono WAV with basic loudness normalization before transcription.

`Overwrite existing outputs`: off by default. Leave it off for resumable batches.

## Output Files

For every processed audio file, the app writes a dedicated folder named after the safe output stem:

```text
output/<safe_unique_filename>/transcripts/<safe_unique_filename>.txt
output/<safe_unique_filename>/transcripts/<safe_unique_filename>.md
output/<safe_unique_filename>/segments/<safe_unique_filename>.segments.json
```

This keeps all files for one audio recording together. The TXT file is timestamp-free and easy for another AI agent to read. The Markdown file includes readable timestamped transcript blocks and metadata. The segment JSON includes the raw source metadata and structured segment times.

Each run also writes:

```text
output/manifests/manifest.csv
output/manifests/manifest.json
output/logs/run.log
```

The manifest records file paths, audio metadata, model settings, status, speed metrics, warnings, and errors.

## Resume And Failures

If outputs already exist and overwrite is disabled, that file is skipped and marked as `skipped` in the manifest and UI.

If one file fails, the app logs the error, marks the file as `failed`, and continues with the next file.

To resume a failed or interrupted batch, launch the UI again with the same input and output folders, keep overwrite disabled, and start transcription.

## Duplicate Filename Handling

Files are processed independently. The app does not infer lesson order and does not sort semantically.

If two input files would create the same output name, the later output receives a stable suffix such as:

```text
lecture.txt
lecture__dup01.txt
```

Exact duplicate-like audio content is detected with a file hash warning, but the app still continues and writes a safely named output.

## Local Backend Architecture

The v1 backend is `local_whisper`, implemented with `faster-whisper`.

The code includes a common `TranscriptionBackend` interface with:

```text
load_model_or_client()
transcribe_file(audio_path, options)
```

Future API backends can be added without rewriting the UI or batch orchestration. API credentials must never be hard-coded; use environment variables or a local ignored `.env` file if API support is added later.

## One-File Test Plan

1. Put one short Turkish audio file in `input_audio/`.
2. Launch the UI with `python app.py`.
3. Set input folder to `.../audio_transcriber/input_audio`.
4. Set output folder to `.../audio_transcriber/output`.
5. Click `Dry-run / scan-only` and confirm the file appears in the status table.
6. Click `Start transcription`.
7. Check that TXT, Markdown, JSON, manifest, and log files are created.
8. Run the same batch again with overwrite disabled and confirm the file is marked `skipped`.

## Troubleshooting

`CUDA not detected`: check the NVIDIA driver with `nvidia-smi`. If CUDA is still unavailable, use `device=cpu` and `compute_type=int8`.

`Out of memory`: use `large-v3-turbo`, `medium`, or `compute_type=int8_float16`.

`ffmpeg missing`: install it with `sudo apt install -y ffmpeg`. The app uses `ffprobe` for metadata and `ffmpeg` for temporary 16 kHz mono WAV conversion.

`Model download slow`: the first run downloads the selected model. Later runs reuse the local cache.

`Empty transcript`: try disabling VAD, confirm the audio file is playable, and check `output/logs/run.log`.

`Poor transcription quality`: use `large-v3`, CUDA, `float16`, VAD on, beam size `5`, and avoid noisy recordings when possible.
