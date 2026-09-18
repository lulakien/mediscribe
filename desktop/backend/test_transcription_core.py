"""Focused, no-network tests for the provider-neutral transcription seam."""

from __future__ import annotations

import io
import json
import logging
import ssl
import sys
from http.client import HTTPMessage
from pathlib import Path
from types import SimpleNamespace
from urllib.error import HTTPError
from urllib.request import Request

import pytest

sys.path.insert(0, str(Path(__file__).parents[2] / "shared"))

import transcribe_core
from transcribe_core import (
    OPENROUTER_DEFAULT_MODEL,
    OPENROUTER_TRANSCRIPTION_URL,
    OPENROUTER_TRANSCRIBE_BACKEND,
    OpenRouterTranscriptionBackend,
    TranscriptionOptions,
    resolve_transcription_options,
)


class FakeResponse:
    def __init__(self, payload: dict[str, object]):
        self._payload = payload

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self._payload).encode("utf-8")


class CapturingTransport:
    def __init__(self, payload: dict[str, object]):
        self.payload = payload
        self.calls: list[tuple[Request, float]] = []

    def __call__(self, request: Request, timeout: float):
        self.calls.append((request, timeout))
        return FakeResponse(self.payload)


@pytest.fixture(autouse=True)
def isolate_real_macos_keychain(monkeypatch):
    """Keep real user credentials from changing environment-key tests."""

    class EmptyKeyStore:
        def get(self):
            return None

    monkeypatch.setitem(
        sys.modules,
        "keychain",
        SimpleNamespace(OpenRouterKeyStore=EmptyKeyStore),
    )


def test_default_options_stay_local_even_when_gateway_is_disabled():
    options = resolve_transcription_options(
        TranscriptionOptions(),
        config={"apiGateway": {"enabled": False, "provider": None}},
        environ={},
    )

    assert options.backend == "local_whisper"
    assert options.model_name == "large-v3"


def test_enabled_openrouter_config_selects_microsoft_default_without_key_value():
    options = resolve_transcription_options(
        TranscriptionOptions(),
        config={
            "apiGateway": {
                "enabled": True,
                "provider": "openrouter",
                "api_key_env_var": "OPENROUTER_API_KEY",
                "timeout_seconds": 600,
            }
        },
        environ={},
    )

    assert options.backend == OPENROUTER_TRANSCRIBE_BACKEND
    assert options.model_name == OPENROUTER_DEFAULT_MODEL
    assert options.endpoint_url == OPENROUTER_TRANSCRIPTION_URL
    assert options.api_key_env_var == "OPENROUTER_API_KEY"
    assert options.device == "remote"
    assert options.compute_type == "api"
    assert options.timeout_seconds == 60.0


def test_explicit_local_environment_override_wins_over_gateway():
    options = resolve_transcription_options(
        TranscriptionOptions(),
        config={
            "apiGateway": {
                "enabled": True,
                "provider": "openrouter",
            }
        },
        environ={"MEDISCRIBE_TRANSCRIPTION_BACKEND": "local_whisper"},
    )

    assert options.backend == "local_whisper"
    assert options.model_name == "large-v3"


def test_missing_key_fails_before_transport_is_called(monkeypatch):
    key_env_name = "MEDISCRIBE_TEST_OPENROUTER_KEY_NOT_SET"
    monkeypatch.delenv(key_env_name, raising=False)
    transport = CapturingTransport({"text": "should not be returned"})
    options = TranscriptionOptions(
        backend=OPENROUTER_TRANSCRIBE_BACKEND,
        model_name=OPENROUTER_DEFAULT_MODEL,
        api_key_env_var=key_env_name,
    )
    backend = OpenRouterTranscriptionBackend(
        options,
        logging.getLogger("test-openrouter"),
        transport=transport,
    )

    with pytest.raises(RuntimeError, match="environment variable"):
        backend.load_model_or_client()

    assert transport.calls == []


def test_openrouter_keychain_fallback_is_used_when_environment_is_empty(monkeypatch):
    class FakeStore:
        def get(self):
            return "sk-or-v1-synthetic-keychain-key"

    key_env_name = "MEDISCRIBE_TEST_OPENROUTER_KEYCHAIN_FALLBACK"
    monkeypatch.setenv(key_env_name, "synthetic-environment-key")
    monkeypatch.setitem(sys.modules, "keychain", SimpleNamespace(OpenRouterKeyStore=FakeStore))
    options = TranscriptionOptions(
        backend=OPENROUTER_TRANSCRIBE_BACKEND,
        model_name=OPENROUTER_DEFAULT_MODEL,
        api_key_env_var=key_env_name,
    )

    backend = OpenRouterTranscriptionBackend(options, logging.getLogger("test-openrouter"))
    backend.load_model_or_client()

    assert backend._api_key == "sk-or-v1-synthetic-keychain-key"


def test_default_openrouter_transport_uses_verified_ssl_context(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("MEDISCRIBE_TEST_OPENROUTER_KEY", "synthetic-test-key")
    captured: dict[str, object] = {}

    def fake_urlopen(request, timeout, context=None):
        captured["context"] = context
        return FakeResponse({"text": "test", "language": "tr"})

    monkeypatch.setattr(transcribe_core, "urlopen", fake_urlopen)
    options = TranscriptionOptions(
        backend=OPENROUTER_TRANSCRIBE_BACKEND,
        model_name=OPENROUTER_DEFAULT_MODEL,
        api_key_env_var="MEDISCRIBE_TEST_OPENROUTER_KEY",
    )

    audio_path = tmp_path / "sample.wav"
    audio_path.write_bytes(b"synthetic audio")
    backend = OpenRouterTranscriptionBackend(options, logging.getLogger("test-openrouter"))
    backend.transcribe_file(audio_path, options)

    context = captured["context"]
    assert isinstance(context, ssl.SSLContext)
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname is True


def test_mai_transcribe_two_request_and_segment_mapping(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("MEDISCRIBE_TEST_OPENROUTER_KEY", "synthetic-test-key")
    audio_path = tmp_path / "sample.wav"
    audio_path.write_bytes(b"synthetic audio bytes")
    transport = CapturingTransport({
        "text": "ilk segment ikinci segment",
        "language": "tr",
        "duration": 2.5,
        "segments": [
            {"start": 0.0, "end": 1.0, "text": "ilk segment"},
            {"start": 1.0, "end": 2.5, "text": "ikinci segment"},
        ],
    })
    options = TranscriptionOptions(
        backend=OPENROUTER_TRANSCRIBE_BACKEND,
        model_name="microsoft/mai-transcribe-2",
        language="tr",
        api_key_env_var="MEDISCRIBE_TEST_OPENROUTER_KEY",
    )

    result = OpenRouterTranscriptionBackend(
        options,
        logging.getLogger("test-openrouter"),
        transport=transport,
    ).transcribe_file(audio_path, options)

    assert len(transport.calls) == 1
    request, timeout = transport.calls[0]
    assert request.full_url == OPENROUTER_TRANSCRIPTION_URL
    assert request.method == "POST"
    assert request.get_header("Authorization") == "Bearer synthetic-test-key"
    assert request.get_header("Content-type") == "application/json"
    assert timeout == 60.0

    request_data = request.data
    assert isinstance(request_data, bytes)
    body = json.loads(request_data.decode("utf-8"))
    assert body["model"] == "microsoft/mai-transcribe-2"
    assert body["input_audio"]["format"] == "wav"
    assert body["input_audio"]["data"] == "c3ludGhldGljIGF1ZGlvIGJ5dGVz"
    assert body["language"] == "tr"
    assert body["response_format"] == "verbose_json"
    assert body["timestamp_granularities"] == ["segment"]
    assert [(segment.start, segment.end, segment.text) for segment in result.segments] == [
        (0.0, 1.0, "ilk segment"),
        (1.0, 2.5, "ikinci segment"),
    ]
    assert result.device_used == "remote"
    assert result.compute_type_used == "api"


def test_mai_transcribe_one_point_five_uses_plain_text_response(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("MEDISCRIBE_TEST_OPENROUTER_KEY", "synthetic-test-key")
    audio_path = tmp_path / "sample.mp3"
    audio_path.write_bytes(b"synthetic audio bytes")
    transport = CapturingTransport({"text": "plain transcript", "language": "tr"})
    options = TranscriptionOptions(
        backend=OPENROUTER_TRANSCRIBE_BACKEND,
        model_name="microsoft/mai-transcribe-1.5",
        language="tr",
        api_key_env_var="MEDISCRIBE_TEST_OPENROUTER_KEY",
    )

    result = OpenRouterTranscriptionBackend(
        options,
        logging.getLogger("test-openrouter"),
        transport=transport,
    ).transcribe_file(audio_path, options)

    request, _ = transport.calls[0]
    request_data = request.data
    assert isinstance(request_data, bytes)
    body = json.loads(request_data.decode("utf-8"))
    assert body["model"] == "microsoft/mai-transcribe-1.5"
    assert "response_format" not in body
    assert result.segments[0].text == "plain transcript"
    assert result.segments[0].start == 0.0


def test_http_failure_does_not_expose_key_or_response_body(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("MEDISCRIBE_TEST_OPENROUTER_KEY", "synthetic-test-key")
    audio_path = tmp_path / "sample.wav"
    audio_path.write_bytes(b"synthetic audio bytes")
    options = TranscriptionOptions(
        backend=OPENROUTER_TRANSCRIBE_BACKEND,
        api_key_env_var="MEDISCRIBE_TEST_OPENROUTER_KEY",
    )

    def failing_transport(request, timeout):
        raise HTTPError(
            request.full_url,
            503,
            "provider unavailable",
        hdrs=HTTPMessage(),
            fp=io.BytesIO(b"synthetic-test-key response body"),
        )

    with pytest.raises(RuntimeError) as error:
        OpenRouterTranscriptionBackend(
            options,
            logging.getLogger("test-openrouter"),
            transport=failing_transport,
        ).transcribe_file(audio_path, options)

    message = str(error.value)
    assert "synthetic-test-key" not in message
    assert "response body" not in message
    assert "503" in message


def test_malformed_response_fails_without_echoing_provider_body(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("MEDISCRIBE_TEST_OPENROUTER_KEY", "synthetic-test-key")
    audio_path = tmp_path / "sample.wav"
    audio_path.write_bytes(b"synthetic audio bytes")
    transport = CapturingTransport({"error": "synthetic provider body"})
    options = TranscriptionOptions(
        backend=OPENROUTER_TRANSCRIBE_BACKEND,
        api_key_env_var="MEDISCRIBE_TEST_OPENROUTER_KEY",
    )

    with pytest.raises(RuntimeError) as error:
        OpenRouterTranscriptionBackend(
            options,
            logging.getLogger("test-openrouter"),
            transport=transport,
        ).transcribe_file(audio_path, options)

    assert "synthetic provider body" not in str(error.value)
