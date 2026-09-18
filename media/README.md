# Sandbox media workspace

This directory is the local media area for the isolated `lulakien/mediscribe`
macOS sandbox.

- `inbox/` contains recordings ready to add to a transcription batch.
- `archive/` contains the original ZIP archive kept for recovery/reference.
- `transcripts/` is the intended local output folder for generated results.
- `manifest.json` records the last audio validation pass without containing
  audio or transcript content.

The recordings, archive, manifest, and generated transcripts are intentionally
ignored by Git so personal study media cannot be committed accidentally.
