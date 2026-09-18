"""Focused tests for the Apple Silicon MLX Whisper adapter."""

from __future__ import annotations

import logging
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).parents[2] / "shared"))

import transcribe_core


def test_large_v3_uses_mlx_on_apple_silicon(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    calls: list[dict[str, object]] = []

    def fake_transcribe(audio_path: str, **kwargs: object) -> dict[str, object]:
        calls.append({"audio_path": audio_path, **kwargs})
        return {
            "text": "ilk segment ikinci segment",
            "language": "tr",
            "segments": [
                {"start": 0.0, "end": 1.0, "text": "ilk segment"},
                {"start": 1.0, "end": 2.5, "text": "ikinci segment"},
            ],
        }

    fake_module = SimpleNamespace(transcribe=fake_transcribe)
    monkeypatch.setitem(sys.modules, "mlx_whisper", fake_module)
    monkeypatch.setattr(transcribe_core.sys, "platform", "darwin")
    monkeypatch.setattr(transcribe_core.platform, "machine", lambda: "arm64")

    audio_path = tmp_path / "sample.wav"
    audio_path.write_bytes(b"synthetic audio")
    options = transcribe_core.TranscriptionOptions(
        model_name="large-v3",
        device="auto",
        language="tr",
        beam_size=5,
    )

    backend = transcribe_core.create_transcription_backend(
        options,
        logging.getLogger("test-mlx"),
    )

    assert isinstance(backend, transcribe_core.MLXWhisperBackend)
    result = backend.transcribe_file(audio_path, options)

    assert result.device_used == "mlx"
    assert result.compute_type_used == "float16"
    assert [(segment.start, segment.end, segment.text) for segment in result.segments] == [
        (0.0, 1.0, "ilk segment"),
        (1.0, 2.5, "ikinci segment"),
    ]
    assert calls[0]["path_or_hf_repo"] == transcribe_core.MLX_WHISPER_LARGE_V3_REPO
    assert calls[0]["language"] == "tr"
    assert calls[0]["beam_size"] == 5
    assert calls[0]["fp16"] is True


def test_cpu_request_keeps_faster_whisper_path_on_apple_silicon(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setitem(sys.modules, "mlx_whisper", SimpleNamespace())
    monkeypatch.setattr(transcribe_core.sys, "platform", "darwin")
    monkeypatch.setattr(transcribe_core.platform, "machine", lambda: "arm64")

    options = transcribe_core.TranscriptionOptions(model_name="large-v3", device="cpu")

    assert transcribe_core.should_use_mlx_whisper(options) is False
