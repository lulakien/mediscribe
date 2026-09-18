from __future__ import annotations

import csv
import base64
import hashlib
import json
import logging
import math
import os
import platform
import re
import shutil
import ssl
import subprocess
import sys
import tempfile
import time
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field, replace
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, cast
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import yaml


AUDIO_EXTENSIONS = {
    ".mp3",
    ".mpeg",
    ".mpga",
    ".m4a",
    ".wav",
    ".flac",
    ".ogg",
    ".opus",
    ".webm",
}

OPENROUTER_TRANSCRIBE_BACKEND = "openrouter_transcribe"
OPENROUTER_TRANSCRIPTION_URL = "https://openrouter.ai/api/v1/audio/transcriptions"
OPENROUTER_DEFAULT_MODEL = "microsoft/mai-transcribe-2"
OPENROUTER_SUPPORTED_MODELS = frozenset({
    "microsoft/mai-transcribe-1.5",
    "microsoft/mai-transcribe-2",
})
OPENROUTER_DEFAULT_API_KEY_ENV_VAR = "OPENROUTER_API_KEY"
OPENROUTER_MAX_TIMEOUT_SECONDS = 60.0
MLX_WHISPER_LARGE_V3_REPO = "mlx-community/whisper-large-v3-mlx"
_ENV_VAR_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_OPENROUTER_AUDIO_FORMATS = {
    ".flac": "flac",
    ".m4a": "m4a",
    ".mp3": "mp3",
    ".mpga": "mpga",
    ".mpeg": "mpeg",
    ".ogg": "ogg",
    ".wav": "wav",
    ".webm": "webm",
}
_OPENROUTER_PROVIDER_AUDIO_FORMATS = frozenset({".flac", ".mp3", ".wav"})
_OPENROUTER_CONVERSION_FORMAT = "flac"


def _openrouter_audio_requires_conversion(audio_path: Path) -> bool:
    """Return whether Azure's OpenRouter adapter needs a compatible WAV input."""
    return audio_path.suffix.lower() not in _OPENROUTER_PROVIDER_AUDIO_FORMATS


def _openrouter_urlopen(request: Request, timeout: float):
    """Open provider requests with the bundled CA trust store on macOS."""
    try:
        import certifi

        context = ssl.create_default_context(cafile=certifi.where())
    except (ImportError, OSError):
        context = ssl.create_default_context()
    return urlopen(request, timeout=timeout, context=context)

BACKEND_CHOICES = [
    "local_whisper",
    OPENROUTER_TRANSCRIBE_BACKEND,
    "openai_transcribe",
    "google_speech",
    "deepgram",
    "azure_speech",
    "custom_http_gateway",
]


@dataclass
class TranscriptionOptions:
    backend: str = "local_whisper"
    model_name: str = "large-v3"
    device: str = "auto"
    compute_type: str = "auto"
    language: str = "tr"
    beam_size: int = 5
    vad_filter: bool = True
    condition_on_previous_text: bool = False
    temperature: float = 0.0
    initial_prompt: str = ""
    endpoint_url: str = OPENROUTER_TRANSCRIPTION_URL
    api_key_env_var: str = OPENROUTER_DEFAULT_API_KEY_ENV_VAR
    timeout_seconds: float = OPENROUTER_MAX_TIMEOUT_SECONDS


def _validate_environment_variable_name(value: str) -> str:
    name = str(value).strip()
    if not _ENV_VAR_NAME_RE.fullmatch(name):
        raise ValueError("The API-key environment-variable name is invalid.")
    return name


def _gateway_config(config: Mapping[str, Any] | None) -> Mapping[str, Any]:
    if not config:
        return {}
    gateway = config.get("apiGateway")
    if gateway is None:
        gateway = config.get("api_gateway")
    if gateway is None:
        return {}
    if not isinstance(gateway, Mapping):
        raise ValueError("apiGateway must be an object.")
    return gateway


def _cloud_model_name(value: Any) -> str:
    model_name = str(value or "").strip()
    if not model_name or model_name == "large-v3":
        return OPENROUTER_DEFAULT_MODEL
    if model_name not in OPENROUTER_SUPPORTED_MODELS:
        raise ValueError("Unsupported OpenRouter transcription model.")
    return model_name


def _cloud_timeout_seconds(value: Any) -> float:
    try:
        timeout = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("OpenRouter timeout must be a positive number.") from exc
    if not math.isfinite(timeout) or timeout <= 0:
        raise ValueError("OpenRouter timeout must be a positive number.")
    return min(timeout, OPENROUTER_MAX_TIMEOUT_SECONDS)


def resolve_transcription_options(
    options: TranscriptionOptions,
    config: Mapping[str, Any] | None = None,
    environ: Mapping[str, str] | None = None,
) -> TranscriptionOptions:
    """Resolve an explicit provider choice without reading or storing a key.

    Local Whisper remains the default. The process-level backend override wins
    over the desktop gateway setting, which lets an operator force local mode
    even when a gateway is configured.
    """
    env = os.environ if environ is None else environ
    gateway = _gateway_config(config)
    env_backend = str(env.get("MEDISCRIBE_TRANSCRIPTION_BACKEND", "")).strip()
    if env_backend and env_backend not in {"local_whisper", OPENROUTER_TRANSCRIBE_BACKEND}:
        raise ValueError("Unsupported transcription backend override.")

    gateway_enabled = gateway.get("enabled") is True
    gateway_provider = gateway.get("provider")
    if gateway_enabled and gateway_provider != "openrouter":
        raise ValueError("Enabled apiGateway must select the openrouter provider.")

    cloud_requested = (
        env_backend == OPENROUTER_TRANSCRIBE_BACKEND
        or (not env_backend and options.backend == OPENROUTER_TRANSCRIBE_BACKEND)
        or (not env_backend and gateway_enabled)
    )
    if not cloud_requested:
        if env_backend == "local_whisper":
            return replace(options, backend="local_whisper")
        return options

    endpoint = gateway.get("endpoint_url") or options.endpoint_url or OPENROUTER_TRANSCRIPTION_URL
    if endpoint != OPENROUTER_TRANSCRIPTION_URL:
        raise ValueError("OpenRouter endpoint is not the canonical transcription endpoint.")

    env_model = str(env.get("MEDISCRIBE_OPENROUTER_MODEL", "")).strip()
    configured_model = gateway.get("model_name")
    option_model = options.model_name if options.model_name != "large-v3" else None
    model_name = _cloud_model_name(env_model or configured_model or option_model)

    configured_key_env = gateway.get("api_key_env_var")
    key_env_name = _validate_environment_variable_name(
        str(
            env.get("MEDISCRIBE_OPENROUTER_API_KEY_ENV")
            or configured_key_env
            or options.api_key_env_var
            or OPENROUTER_DEFAULT_API_KEY_ENV_VAR
        )
    )

    timeout_value = gateway.get("timeout_seconds", options.timeout_seconds)
    return replace(
        options,
        backend=OPENROUTER_TRANSCRIBE_BACKEND,
        model_name=model_name,
        device="remote",
        compute_type="api",
        endpoint_url=OPENROUTER_TRANSCRIPTION_URL,
        api_key_env_var=key_env_name,
        timeout_seconds=_cloud_timeout_seconds(timeout_value),
    )


@dataclass
class Segment:
    start: float
    end: float
    text: str

    def to_json(self) -> dict[str, Any]:
        return {
            "start": round_float(self.start),
            "end": round_float(self.end),
            "start_hms": seconds_to_hms(self.start),
            "end_hms": seconds_to_hms(self.end),
            "text": self.text.strip(),
        }


@dataclass
class DisplayBlock:
    start: float
    end: float
    text: str


@dataclass
class BackendResult:
    segments: list[Segment]
    model_name: str
    language: str
    device_used: str
    compute_type_used: str
    duration_seconds: float | None = None
    detected_language: str | None = None
    language_probability: float | None = None
    warnings: list[str] = field(default_factory=list)


@dataclass
class AudioMetadata:
    duration_seconds: float | None = None
    codec: str | None = None
    sample_rate: str | None = None
    channels: int | None = None
    bitrate: str | None = None
    file_size_mb: float | None = None
    modified_time: str | None = None
    warnings: list[str] = field(default_factory=list)


@dataclass
class FilePlan:
    source_path: Path
    safe_output_stem: str
    file_hash_short: str
    original_filename: str | None = None
    warnings: list[str] = field(default_factory=list)


@dataclass
class ManifestRow:
    original_filename: str
    safe_output_stem: str
    source_path: str
    output_txt_path: str
    output_md_path: str
    output_json_path: str
    duration_seconds: float | None
    duration_hms: str
    codec: str | None
    sample_rate: str | None
    channels: int | None
    bitrate: str | None
    file_size_mb: float | None
    modified_time: str | None
    file_hash_short: str
    model_name: str
    device_requested: str
    device_used: str
    compute_type_requested: str
    compute_type_used: str
    vad_filter: bool
    beam_size: int
    transcription_status: str
    processing_started_at: str
    processing_finished_at: str
    wall_time_seconds: float | None
    realtime_factor: float | None
    audio_seconds_per_second: float | None
    warnings: str
    error_message: str


@dataclass
class RunMetrics:
    current_file_duration: float | None = None
    wall_time_seconds: float | None = None
    realtime_factor: float | None = None
    audio_seconds_per_second: float | None = None
    total_processed_duration: float = 0.0
    total_elapsed_time: float = 0.0
    device_used: str = ""
    compute_type_used: str = ""


@dataclass
class ProgressEvent:
    message: str
    current_file: str = ""
    status_rows: list[dict[str, Any]] = field(default_factory=list)
    metrics: RunMetrics = field(default_factory=RunMetrics)
    model_status: str = ""
    log_tail: str = ""
    progress: float = 0.0


ProgressCallback = Callable[[ProgressEvent], None]


class TranscriptionBackend(ABC):
    """Common interface for local and future API transcription backends."""

    @abstractmethod
    def load_model_or_client(self) -> None:
        raise NotImplementedError

    @abstractmethod
    def transcribe_file(self, audio_path: Path, options: TranscriptionOptions) -> BackendResult:
        raise NotImplementedError


class FutureBackendPlaceholder(TranscriptionBackend):
    def __init__(self, backend_name: str) -> None:
        self.backend_name = backend_name

    def load_model_or_client(self) -> None:
        raise NotImplementedError("This backend is reserved for future implementation.")

    def transcribe_file(self, audio_path: Path, options: TranscriptionOptions) -> BackendResult:
        raise NotImplementedError("This backend is reserved for future implementation.")


def should_use_mlx_whisper(options: TranscriptionOptions) -> bool:
    """Select native MLX for full large-v3 on Apple Silicon when available."""
    if options.backend != "local_whisper":
        return False
    if options.model_name not in {"large-v3", "large-v3-mlx"}:
        return False
    if options.device == "cpu":
        return False
    if sys.platform != "darwin" or platform.machine().lower() not in {"arm64", "aarch64"}:
        return False
    try:
        import mlx_whisper  # noqa: F401
    except ImportError:
        return False
    return True


class MLXWhisperBackend(TranscriptionBackend):
    """Apple Silicon backend using the full-quality MLX Whisper checkpoint."""

    def __init__(self, options: TranscriptionOptions, logger: logging.Logger) -> None:
        self.options = options
        self.logger = logger
        self.module: Any | None = None
        self.device_used = "mlx"
        self.compute_type_used = "float16"

    def load_model_or_client(self) -> None:
        if self.module is not None:
            return
        try:
            import mlx_whisper
        except ImportError as exc:
            raise RuntimeError(
                "MLX Whisper is not installed. Activate the virtual environment and run "
                "pip install -r requirements.txt."
            ) from exc
        if not hasattr(mlx_whisper, "transcribe"):
            raise RuntimeError("The installed MLX Whisper package does not expose transcribe().")
        self.module = mlx_whisper
        self.logger.info(
            "Using Apple Silicon MLX Whisper model %s.",
            MLX_WHISPER_LARGE_V3_REPO,
        )

    def transcribe_file(self, audio_path: Path, options: TranscriptionOptions) -> BackendResult:
        self.load_model_or_client()
        assert self.module is not None

        try:
            # mlx-whisper currently exposes greedy decoding only; even
            # beam_size=1 is treated as beam search, so omit the option.
            response = self.module.transcribe(
                str(audio_path),
                path_or_hf_repo=MLX_WHISPER_LARGE_V3_REPO,
                verbose=None,
                language=options.language or None,
                task="transcribe",
                condition_on_previous_text=options.condition_on_previous_text,
                initial_prompt=options.initial_prompt or None,
                temperature=options.temperature,
                fp16=True,
            )
        except Exception as exc:
            raise RuntimeError("MLX Whisper transcription failed.") from exc

        if not isinstance(response, Mapping):
            raise RuntimeError("MLX Whisper returned an unexpected transcription response.")
        text_value = response.get("text")
        if not isinstance(text_value, str):
            raise RuntimeError("MLX Whisper returned a transcription response without text.")

        raw_segments = response.get("segments")
        if raw_segments is not None and not isinstance(raw_segments, list):
            raise RuntimeError("MLX Whisper returned malformed transcription segments.")

        segments: list[Segment] = []
        if isinstance(raw_segments, list):
            for raw_segment in raw_segments:
                if not isinstance(raw_segment, Mapping):
                    raise RuntimeError("MLX Whisper returned malformed transcription segments.")
                start_value = raw_segment.get("start")
                end_value = raw_segment.get("end")
                segment_text = raw_segment.get("text")
                if (
                    isinstance(start_value, bool)
                    or not isinstance(start_value, (int, float, str))
                    or isinstance(end_value, bool)
                    or not isinstance(end_value, (int, float, str))
                    or not isinstance(segment_text, str)
                ):
                    raise RuntimeError("MLX Whisper returned malformed transcription segments.")
                try:
                    start = float(start_value)
                    end = float(end_value)
                except (TypeError, ValueError):
                    raise RuntimeError("MLX Whisper returned malformed transcription segments.") from None
                if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end < start:
                    raise RuntimeError("MLX Whisper returned malformed transcription segments.")
                if segment_text.strip():
                    segments.append(Segment(start=start, end=end, text=segment_text.strip()))

        duration_value = response.get("duration")
        duration: float | None = None
        if duration_value is not None:
            try:
                duration = float(duration_value)
            except (TypeError, ValueError):
                raise RuntimeError("MLX Whisper returned an invalid transcription duration.") from None
            if not math.isfinite(duration) or duration < 0:
                raise RuntimeError("MLX Whisper returned an invalid transcription duration.")
        elif segments:
            duration = max(segment.end for segment in segments)

        detected_language = response.get("language")
        if not isinstance(detected_language, str) or not detected_language.strip():
            detected_language = None
        warnings = [
            "Using Apple Silicon MLX Whisper with the full large-v3 checkpoint.",
        ]
        if options.beam_size != 1:
            warnings.append(
                "MLX Whisper does not implement beam search; used greedy decoding with beam_size=1."
            )
        if options.vad_filter:
            warnings.append("MLX Whisper does not use faster-whisper's VAD filter; native decoding was used.")

        return BackendResult(
            segments=segments or [Segment(start=0.0, end=duration or 0.0, text=text_value.strip())],
            model_name=options.model_name,
            language=detected_language or options.language,
            device_used=self.device_used,
            compute_type_used=self.compute_type_used,
            duration_seconds=duration,
            detected_language=detected_language,
            warnings=warnings,
        )


class LocalWhisperBackend(TranscriptionBackend):
    def __init__(self, options: TranscriptionOptions, logger: logging.Logger) -> None:
        self.options = options
        self.logger = logger
        self.model: Any | None = None
        self.device_used = resolve_device(options.device)
        self.compute_type_used = resolve_compute_type(options.compute_type, self.device_used)
        self.load_warnings: list[str] = []

    def load_model_or_client(self) -> None:
        if self.model is not None:
            return

        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise RuntimeError(
                "faster-whisper is not installed. Activate the virtual environment and run "
                "pip install -r requirements.txt."
            ) from exc

        self.logger.info(
            "Loading model %s on %s with compute_type=%s",
            self.options.model_name,
            self.device_used,
            self.compute_type_used,
        )

        try:
            self.model = WhisperModel(
                self.options.model_name,
                device=self.device_used,
                compute_type=self.compute_type_used,
            )
        except Exception as exc:
            if self.device_used == "cuda" and self.compute_type_used == "float16":
                self.logger.warning(
                    "CUDA float16 model load failed; retrying CUDA int8_float16: %s", exc
                )
                self.load_warnings.append(
                    "CUDA float16 model load failed; retried with CUDA int8_float16."
                )
                self.compute_type_used = "int8_float16"
                self.model = WhisperModel(
                    self.options.model_name,
                    device="cuda",
                    compute_type=self.compute_type_used,
                )
            else:
                raise

    def transcribe_file(self, audio_path: Path, options: TranscriptionOptions) -> BackendResult:
        self.load_model_or_client()
        assert self.model is not None

        segments_iter, info = self.model.transcribe(
            str(audio_path),
            language=options.language,
            beam_size=options.beam_size,
            vad_filter=options.vad_filter,
            condition_on_previous_text=options.condition_on_previous_text,
            temperature=options.temperature,
            initial_prompt=options.initial_prompt or None,
            task="transcribe",
        )
        segments = [
            Segment(start=float(seg.start), end=float(seg.end), text=str(seg.text).strip())
            for seg in segments_iter
        ]

        warnings: list[str] = list(self.load_warnings)
        detected_language = getattr(info, "language", None)
        language_probability = getattr(info, "language_probability", None)
        duration = getattr(info, "duration", None)
        if detected_language and detected_language != options.language:
            warnings.append(f"Detected language is {detected_language}, expected {options.language}.")
        if language_probability is not None and language_probability < 0.65:
            warnings.append(f"Language probability is low: {language_probability:.2f}.")

        return BackendResult(
            segments=segments,
            model_name=options.model_name,
            language=options.language,
            device_used=self.device_used,
            compute_type_used=self.compute_type_used,
            duration_seconds=float(duration) if duration is not None else None,
            detected_language=detected_language,
            language_probability=language_probability,
            warnings=warnings,
        )


def _load_openrouter_api_key(key_env_name: str) -> str:
    """Read the sandbox credential without ever serializing it into a job."""
    # The in-app Keychain value is authoritative for this sandbox. A
    # deliberately configured process environment remains supported as the
    # fallback for scripted launches and backwards compatibility.
    try:
        from keychain import OpenRouterKeyStore

        keychain_value = OpenRouterKeyStore().get()
        if keychain_value:
            return keychain_value
    except Exception:
        # Missing optional desktop Keychain support is reported by the caller
        # as a missing credential; no platform or backend exception is leaked.
        pass

    return os.environ.get(key_env_name, "").strip()


class OpenRouterTranscriptionBackend(TranscriptionBackend):
    """Explicit opt-in adapter for OpenRouter's documented STT endpoint."""

    def __init__(
        self,
        options: TranscriptionOptions,
        logger: logging.Logger,
        transport: Callable[..., Any] | None = None,
    ) -> None:
        self.options = options
        self.logger = logger
        self.transport = transport or _openrouter_urlopen
        self.device_used = "remote"
        self.compute_type_used = "api"
        self._api_key: str | None = None
        self._model_name = OPENROUTER_DEFAULT_MODEL
        self._endpoint_url = OPENROUTER_TRANSCRIPTION_URL

    def load_model_or_client(self) -> None:
        if self._api_key is not None:
            return

        endpoint_url = self.options.endpoint_url or OPENROUTER_TRANSCRIPTION_URL
        if endpoint_url != OPENROUTER_TRANSCRIPTION_URL:
            raise RuntimeError("OpenRouter endpoint is not the canonical transcription endpoint.")

        self._model_name = _cloud_model_name(self.options.model_name)
        key_env_name = _validate_environment_variable_name(
            self.options.api_key_env_var or OPENROUTER_DEFAULT_API_KEY_ENV_VAR
        )
        api_key = _load_openrouter_api_key(key_env_name)
        if not api_key:
            raise RuntimeError(
                "OpenRouter transcription is enabled but no API key is available in the configured environment variable or this sandbox's macOS Keychain."
            )

        self._endpoint_url = endpoint_url
        self._api_key = api_key
        self.logger.info("OpenRouter transcription enabled for model %s.", self._model_name)

    def transcribe_file(self, audio_path: Path, options: TranscriptionOptions) -> BackendResult:
        self.load_model_or_client()
        assert self._api_key is not None

        audio_format = _OPENROUTER_AUDIO_FORMATS.get(audio_path.suffix.lower())
        if audio_format is None:
            raise RuntimeError("OpenRouter transcription does not support this audio format directly.")

        try:
            audio_data = base64.b64encode(audio_path.read_bytes()).decode("ascii")
        except OSError as exc:
            raise RuntimeError("The audio file could not be read for OpenRouter transcription.") from exc

        model_name = _cloud_model_name(options.model_name or self._model_name)
        payload: dict[str, Any] = {
            "model": model_name,
            "input_audio": {
                "data": audio_data,
                "format": audio_format,
            },
        }
        if options.language and options.language.lower() not in {"auto", "automatic"}:
            payload["language"] = options.language
        if model_name == "microsoft/mai-transcribe-2":
            payload["response_format"] = "verbose_json"
            payload["timestamp_granularities"] = ["segment"]

        request = Request(
            self._endpoint_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with self.transport(request, timeout=_cloud_timeout_seconds(self.options.timeout_seconds)) as response:
                status = getattr(response, "status", None)
                if status is not None and int(status) >= 400:
                    raise RuntimeError(f"OpenRouter transcription request failed with HTTP status {int(status)}.")
                response_bytes = response.read()
        except HTTPError as exc:
            status = getattr(exc, "code", "unknown")
            raise RuntimeError(
                f"OpenRouter transcription request failed with HTTP status {status}."
            ) from None
        except (URLError, TimeoutError, OSError):
            raise RuntimeError(
                "OpenRouter transcription request failed before a response was received."
            ) from None
        except RuntimeError:
            raise

        try:
            response_data = json.loads(response_bytes.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise RuntimeError("OpenRouter returned an invalid JSON response.") from None

        return _backend_result_from_openrouter_response(response_data, options, model_name)


def _backend_result_from_openrouter_response(
    response_data: Any,
    options: TranscriptionOptions,
    model_name: str,
) -> BackendResult:
    if not isinstance(response_data, Mapping):
        raise RuntimeError("OpenRouter returned an unexpected transcription response.")

    text_value = response_data.get("text")
    if not isinstance(text_value, str):
        raise RuntimeError("OpenRouter returned a transcription response without text.")

    duration_value = response_data.get("duration")
    duration: float | None = None
    if duration_value is not None:
        try:
            duration = float(duration_value)
        except (TypeError, ValueError):
            raise RuntimeError("OpenRouter returned an invalid transcription duration.") from None
        if not math.isfinite(duration) or duration < 0:
            raise RuntimeError("OpenRouter returned an invalid transcription duration.")

    segments: list[Segment] = []
    raw_segments = response_data.get("segments")
    if raw_segments is not None:
        if not isinstance(raw_segments, list):
            raise RuntimeError("OpenRouter returned malformed transcription segments.")
        for raw_segment in raw_segments:
            if not isinstance(raw_segment, Mapping):
                raise RuntimeError("OpenRouter returned malformed transcription segments.")
            segment_map = cast(Mapping[str, Any], raw_segment)
            segment_text = segment_map.get("text")
            if not isinstance(segment_text, str):
                raise RuntimeError("OpenRouter returned malformed transcription segments.")
            start_value = segment_map.get("start")
            end_value = segment_map.get("end")
            if (
                isinstance(start_value, bool)
                or not isinstance(start_value, (int, float, str))
                or isinstance(end_value, bool)
                or not isinstance(end_value, (int, float, str))
            ):
                raise RuntimeError("OpenRouter returned malformed transcription segments.")
            try:
                start = float(start_value)
                end = float(end_value)
            except (TypeError, ValueError):
                raise RuntimeError("OpenRouter returned malformed transcription segments.") from None
            if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end < start:
                raise RuntimeError("OpenRouter returned malformed transcription segments.")
            if segment_text.strip():
                segments.append(Segment(start=start, end=end, text=segment_text.strip()))

    warnings = ["Audio was sent to OpenRouter for explicit cloud transcription."]
    if not segments and text_value.strip():
        segments.append(
            Segment(
                start=0.0,
                end=duration or 0.0,
                text=text_value.strip(),
            )
        )
        warnings.append("OpenRouter response did not include segments; wrote a single transcript segment.")

    detected_language = response_data.get("language")
    if not isinstance(detected_language, str) or not detected_language.strip():
        detected_language = None
    language = detected_language or options.language
    return BackendResult(
        segments=segments,
        model_name=model_name,
        language=language,
        device_used="remote",
        compute_type_used="api",
        duration_seconds=duration,
        detected_language=detected_language,
        warnings=warnings,
    )


def create_transcription_backend(
    options: TranscriptionOptions,
    logger: logging.Logger,
    transport: Callable[..., Any] | None = None,
) -> TranscriptionBackend:
    """Create the selected backend while keeping unsupported choices explicit."""
    if options.backend == "local_whisper":
        if should_use_mlx_whisper(options):
            return MLXWhisperBackend(options, logger)
        return LocalWhisperBackend(options, logger)
    if options.backend == OPENROUTER_TRANSCRIBE_BACKEND:
        return OpenRouterTranscriptionBackend(options, logger, transport=transport)
    return FutureBackendPlaceholder(options.backend)


@dataclass
class UnsupportedFile:
    source_path: Path
    reason: str
    original_filename: str | None = None


def run_batch(
    input_folder: str | Path | None,
    output_folder: str | Path,
    options: TranscriptionOptions,
    normalize_audio: bool = False,
    overwrite: bool = False,
    dry_run: bool = False,
    progress_callback: ProgressCallback | None = None,
    selected_files: list[Any] | None = None,
    input_mode: str = "folder",
) -> list[ManifestRow]:
    if input_mode == "selected_files":
        files, unsupported_files, input_description = collect_audio_files_from_selection(selected_files)
        empty_message = "No selected audio files. Use Add audio files to choose one or more supported audio files."
    else:
        input_dir = Path(input_folder or "").expanduser()
        files = collect_audio_files_from_folder(input_dir)
        unsupported_files = []
        input_description = str(input_dir)
        empty_message = "No supported audio files found in the selected input folder."

    return transcribe_files(
        file_paths=files,
        output_folder=output_folder,
        options=options,
        normalize_audio=normalize_audio,
        overwrite=overwrite,
        dry_run=dry_run,
        progress_callback=progress_callback,
        unsupported_files=unsupported_files,
        input_description=input_description,
        empty_message=empty_message,
    )


def transcribe_files(
    file_paths: list[Path],
    output_folder: str | Path,
    options: TranscriptionOptions,
    normalize_audio: bool = False,
    overwrite: bool = False,
    dry_run: bool = False,
    progress_callback: ProgressCallback | None = None,
    unsupported_files: list[UnsupportedFile] | None = None,
    input_description: str = "",
    empty_message: str = "No supported audio files found.",
) -> list[ManifestRow]:
    output_dir = Path(output_folder).expanduser()
    output_paths = ensure_output_dirs(output_dir)
    logger = setup_run_logger(output_paths["logs"] / "run.log")
    log_buffer = LogBuffer()
    logger.addHandler(log_buffer)

    run_started = time.monotonic()
    rows: list[ManifestRow] = []
    status_rows: list[dict[str, Any]] = []
    total_processed_duration = 0.0
    ffprobe_path = shutil.which("ffprobe")
    ffmpeg_path = shutil.which("ffmpeg")

    logger.info("Starting %s run", "dry-run" if dry_run else "transcription")
    logger.info("Input: %s", input_description or "explicit file selection")
    logger.info("Output folder: %s", output_dir)

    files = list(file_paths)
    unsupported_files = unsupported_files or []
    duplicate_hashes = find_duplicate_hashes(files)
    existing_manifest = read_existing_manifest(output_paths["manifests"])
    plans = make_file_plans(files, output_paths, overwrite, duplicate_hashes, existing_manifest)

    for unsupported in unsupported_files:
        row = build_unsupported_manifest_row(unsupported, output_paths, options)
        rows.append(row)
        append_status(status_rows, row)

    if not files:
        if unsupported_files:
            empty_message = "No supported audio files were selected; unsupported files were skipped."
        logger.warning(empty_message)
        write_manifests(output_paths["manifests"], rows)
        emit(
            progress_callback,
            empty_message,
            status_rows,
            RunMetrics(total_elapsed_time=time.monotonic() - run_started),
            model_status="No model loaded.",
            log_tail=log_buffer.text(),
            progress=1.0,
        )
        return rows

    backend: TranscriptionBackend | None = None
    model_status = "Dry-run: model not loaded." if dry_run else "Waiting to load model."

    total_items = len(plans) + len(unsupported_files)
    completed_items = len(unsupported_files)

    if unsupported_files:
        emit(
            progress_callback,
            "Unsupported files were skipped.",
            status_rows,
            RunMetrics(total_elapsed_time=time.monotonic() - run_started),
            model_status=model_status,
            log_tail=log_buffer.text(),
            progress=completed_items / total_items if total_items else 0.0,
        )

    for index, plan in enumerate(plans, start=1):
        source_path = plan.source_path
        set_status_row(
            status_rows,
            file=plan.original_filename or source_path.name,
            source=normalize_source_path(str(source_path)),
            status="probing",
        )
        emit(
            progress_callback,
            f"Probing {source_path.name}",
            status_rows,
            RunMetrics(total_processed_duration=total_processed_duration, total_elapsed_time=time.monotonic() - run_started),
            model_status=model_status,
            current_file=source_path.name,
            log_tail=log_buffer.text(),
            progress=(completed_items + index - 1) / total_items,
        )

        metadata = probe_audio(source_path, ffprobe_path)
        set_status_row(
            status_rows,
            file=plan.original_filename or source_path.name,
            source=normalize_source_path(str(source_path)),
            duration_seconds=metadata.duration_seconds,
            duration=seconds_to_hms(metadata.duration_seconds),
            status="pending",
        )
        warnings = list(plan.warnings) + metadata.warnings
        if ffprobe_path is None:
            warnings.append("ffprobe missing; audio metadata may be incomplete.")
        if ffmpeg_path is None and not dry_run:
            warnings.append("ffmpeg missing; original audio will be sent directly to backend.")
        if metadata.duration_seconds is not None and metadata.duration_seconds < 5:
            warnings.append("File duration is very short.")
        cloud_audio_conversion = (
            options.backend == OPENROUTER_TRANSCRIBE_BACKEND
            and _openrouter_audio_requires_conversion(source_path)
        )
        if cloud_audio_conversion:
            warnings.append("Converted to a lossless 16 kHz mono FLAC for Microsoft/Azure audio compatibility.")

        started_at = utc_now()
        output_txt, output_md, output_json = output_file_paths(output_paths, plan.safe_output_stem)

        existing_count = existing_output_count(output_txt, output_md, output_json)
        if existing_count == 3 and not overwrite:
            warnings.append("Outputs already exist; skipped because overwrite is disabled.")
            row = build_manifest_row(
                plan=plan,
                metadata=metadata,
                options=options,
                output_txt=output_txt,
                output_md=output_md,
                output_json=output_json,
                status="skipped",
                started_at=started_at,
                finished_at=utc_now(),
                warnings=warnings,
                device_used="",
                compute_type_used="",
            )
            rows.append(row)
            write_manifests(output_paths["manifests"], rows)
            append_status(status_rows, row)
            logger.info("Skipped existing outputs for %s", source_path.name)
            emit(
                progress_callback,
                f"Skipped {source_path.name}",
                status_rows,
                RunMetrics(total_processed_duration=total_processed_duration, total_elapsed_time=time.monotonic() - run_started),
                model_status=model_status,
                current_file=source_path.name,
                log_tail=log_buffer.text(),
                progress=(completed_items + index) / total_items,
            )
            continue

        if 0 < existing_count < 3 and not overwrite:
            warnings.append("Partial existing outputs found; generated unique output stem to avoid overwrite.")
            safe_stem_value = next_available_stem(plan.safe_output_stem, output_paths)
            plan = FilePlan(
                source_path=plan.source_path,
                safe_output_stem=safe_stem_value,
                file_hash_short=plan.file_hash_short,
                original_filename=plan.original_filename,
                warnings=plan.warnings,
            )
            output_txt, output_md, output_json = output_file_paths(output_paths, plan.safe_output_stem)

        if dry_run:
            row = build_manifest_row(
                plan=plan,
                metadata=metadata,
                options=options,
                output_txt=output_txt,
                output_md=output_md,
                output_json=output_json,
                status="scan_only",
                started_at=started_at,
                finished_at=utc_now(),
                warnings=warnings,
                device_used="",
                compute_type_used="",
            )
            rows.append(row)
            write_manifests(output_paths["manifests"], rows)
            append_status(status_rows, row)
            emit(
                progress_callback,
                f"Scanned {source_path.name}",
                status_rows,
                RunMetrics(
                    current_file_duration=metadata.duration_seconds,
                    total_processed_duration=total_processed_duration,
                    total_elapsed_time=time.monotonic() - run_started,
                ),
                model_status=model_status,
                current_file=source_path.name,
                log_tail=log_buffer.text(),
                progress=(completed_items + index) / total_items,
            )
            continue

        file_started = time.monotonic()
        temp_audio: Path | None = None
        try:
            set_status_row(
                status_rows,
                file=plan.original_filename or source_path.name,
                source=normalize_source_path(str(source_path)),
                duration_seconds=metadata.duration_seconds,
                duration=seconds_to_hms(metadata.duration_seconds),
                status="processing",
                warning=join_warnings(warnings),
            )
            if backend is None:
                backend = create_transcription_backend(options, logger)
                model_status = (
                    "Loading model..."
                    if options.backend == "local_whisper"
                    else "Connecting to transcription provider..."
                )
                emit(
                    progress_callback,
                    model_status,
                    status_rows,
                    RunMetrics(total_processed_duration=total_processed_duration, total_elapsed_time=time.monotonic() - run_started),
                    model_status=model_status,
                    current_file=source_path.name,
                    log_tail=log_buffer.text(),
                    progress=(completed_items + index - 1) / total_items,
                )
                backend.load_model_or_client()
                device_used = getattr(backend, "device_used", "")
                compute_type_used = getattr(backend, "compute_type_used", "")
                if options.backend == "local_whisper":
                    model_status = f"Loaded {options.model_name} on {device_used} ({compute_type_used})."
                elif options.backend == OPENROUTER_TRANSCRIBE_BACKEND:
                    model_status = f"Connected to OpenRouter for {options.model_name}."
                else:
                    model_status = f"Loaded {options.model_name}."
                if options.device == "auto" and device_used == "cpu":
                    warnings.append("CUDA unavailable; using CPU.")
                if options.compute_type == "auto" and compute_type_used != "float16" and options.backend == "local_whisper":
                    warnings.append(f"Using compute type {compute_type_used}.")
                emit(
                    progress_callback,
                    f"Transcribing {source_path.name}",
                    status_rows,
                    RunMetrics(
                        current_file_duration=metadata.duration_seconds,
                        total_processed_duration=total_processed_duration,
                        total_elapsed_time=time.monotonic() - run_started,
                        device_used=device_used,
                        compute_type_used=compute_type_used,
                    ),
                    model_status=model_status,
                    current_file=source_path.name,
                    log_tail=log_buffer.text(),
                    progress=(completed_items + index - 1) / total_items,
                )

            if cloud_audio_conversion and ffmpeg_path is None:
                raise RuntimeError(
                    "Microsoft/OpenRouter transcription requires ffmpeg to convert this audio file to WAV."
                )
            temp_audio = prepare_working_audio(
                source_path,
                output_paths["temp"],
                ffmpeg_path,
                normalize_audio,
                logger,
                output_format=_OPENROUTER_CONVERSION_FORMAT if cloud_audio_conversion else "wav",
            )
            result = backend.transcribe_file(temp_audio or source_path, options)
            warnings.extend(result.warnings)
            transcript_text = "\n".join(seg.text.strip() for seg in result.segments if seg.text.strip()).strip()
            if not transcript_text:
                warnings.append("Transcript is empty.")

            duration = metadata.duration_seconds or result.duration_seconds
            finished_at = utc_now()
            wall_time = time.monotonic() - file_started
            realtime_factor = (wall_time / duration) if duration and duration > 0 else None
            audio_seconds_per_second = (duration / wall_time) if duration and wall_time > 0 else None

            write_outputs(
                source_path=source_path,
                plan=plan,
                metadata=metadata,
                result=result,
                options=options,
                output_txt=output_txt,
                output_md=output_md,
                output_json=output_json,
                warnings=warnings,
            )
            total_processed_duration += duration or 0.0
            row = build_manifest_row(
                plan=plan,
                metadata=metadata,
                options=options,
                output_txt=output_txt,
                output_md=output_md,
                output_json=output_json,
                status="completed",
                started_at=started_at,
                finished_at=finished_at,
                warnings=warnings,
                device_used=result.device_used,
                compute_type_used=result.compute_type_used,
                wall_time_seconds=wall_time,
                realtime_factor=realtime_factor,
                audio_seconds_per_second=audio_seconds_per_second,
                duration_override=duration,
            )
            rows.append(row)
            write_manifests(output_paths["manifests"], rows)
            append_status(status_rows, row)
            logger.info("Completed %s in %.2fs", source_path.name, wall_time)
            emit(
                progress_callback,
                f"Completed {source_path.name}",
                status_rows,
                RunMetrics(
                    current_file_duration=duration,
                    wall_time_seconds=wall_time,
                    realtime_factor=realtime_factor,
                    audio_seconds_per_second=audio_seconds_per_second,
                    total_processed_duration=total_processed_duration,
                    total_elapsed_time=time.monotonic() - run_started,
                    device_used=result.device_used,
                    compute_type_used=result.compute_type_used,
                ),
                model_status=model_status,
                current_file=source_path.name,
                log_tail=log_buffer.text(),
                progress=(completed_items + index) / total_items,
            )
        except Exception as exc:
            logger.exception("Failed to process %s", source_path)
            warnings.append(exception_message(exc))
            row = build_manifest_row(
                plan=plan,
                metadata=metadata,
                options=options,
                output_txt=output_txt,
                output_md=output_md,
                output_json=output_json,
                status="failed",
                started_at=started_at,
                finished_at=utc_now(),
                warnings=warnings,
                error_message=exception_message(exc),
                device_used=getattr(backend, "device_used", ""),
                compute_type_used=getattr(backend, "compute_type_used", ""),
            )
            rows.append(row)
            write_manifests(output_paths["manifests"], rows)
            append_status(status_rows, row)
            emit(
                progress_callback,
                f"Failed {source_path.name}: {exception_message(exc)}",
                status_rows,
                RunMetrics(total_processed_duration=total_processed_duration, total_elapsed_time=time.monotonic() - run_started),
                model_status=model_status,
                current_file=source_path.name,
                log_tail=log_buffer.text(),
                progress=(completed_items + index) / total_items,
            )
        finally:
            if temp_audio and temp_audio.exists():
                temp_audio.unlink(missing_ok=True)

    write_manifests(output_paths["manifests"], rows)
    logger.info("Run finished. Manifest rows: %d", len(rows))
    return rows


def load_config(config_path: str | Path = "config.yaml") -> dict[str, Any]:
    path = Path(config_path)
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def options_from_config(config: dict[str, Any]) -> TranscriptionOptions:
    backend = config.get("backend", "local_whisper")
    local = (config.get("backends") or {}).get("local_whisper", {})
    return TranscriptionOptions(
        backend=backend,
        model_name=local.get("model_name", "large-v3"),
        device=local.get("device", "auto"),
        compute_type=local.get("compute_type", "auto"),
        language=local.get("language", "tr"),
        beam_size=int(local.get("beam_size", 5)),
        vad_filter=bool(local.get("vad_filter", True)),
        condition_on_previous_text=bool(local.get("condition_on_previous_text", False)),
        temperature=float(local.get("temperature", 0)),
        initial_prompt=str(local.get("initial_prompt", "")),
    )


def scan_audio_files(input_dir: Path) -> list[Path]:
    return collect_audio_files_from_folder(input_dir)


def collect_audio_files_from_folder(input_dir: Path) -> list[Path]:
    if not input_dir.exists() or not input_dir.is_dir():
        return []
    return [
        path
        for path in sorted(input_dir.rglob("*"), key=lambda p: str(p).lower())
        if path.is_file() and path.suffix.lower() in AUDIO_EXTENSIONS
    ]


def collect_audio_files_from_selection(selected_files: list[Any] | None) -> tuple[list[Path], list[UnsupportedFile], str]:
    valid: list[Path] = []
    unsupported: list[UnsupportedFile] = []
    descriptions: list[str] = []
    for item in selected_files or []:
        path, original_name = selected_file_to_path(item)
        if path is None:
            unsupported.append(
                UnsupportedFile(
                    source_path=Path(str(item)),
                    original_filename=original_name,
                    reason="Selected file path is unavailable.",
                )
            )
            continue
        descriptions.append(str(path))
        if path.suffix.lower() not in AUDIO_EXTENSIONS:
            unsupported.append(
                UnsupportedFile(
                    source_path=path,
                    original_filename=original_name,
                    reason=f"Unsupported audio extension: {path.suffix or '(none)'}.",
                )
            )
            continue
        if not path.exists() or not path.is_file():
            unsupported.append(
                UnsupportedFile(
                    source_path=path,
                    original_filename=original_name,
                    reason="Selected file does not exist or is not readable.",
                )
            )
            continue
        valid.append(path)
    return valid, unsupported, ", ".join(descriptions)


def selected_file_to_path(item: Any) -> tuple[Path | None, str | None]:
    if item is None:
        return None, None
    if isinstance(item, (str, Path)):
        path = Path(item).expanduser()
        return path, path.name
    if isinstance(item, dict):
        raw_path = item.get("path") or item.get("name") or item.get("orig_name")
        original_name = item.get("orig_name") or (Path(str(raw_path)).name if raw_path else None)
        return (Path(raw_path).expanduser() if raw_path else None), original_name
    raw_path = getattr(item, "path", None) or getattr(item, "name", None)
    original_name = getattr(item, "orig_name", None) or (Path(str(raw_path)).name if raw_path else None)
    return (Path(raw_path).expanduser() if raw_path else None), original_name


def ensure_output_dirs(output_dir: Path) -> dict[str, Path]:
    paths = {
        "root": output_dir,
        "logs": output_dir / "logs",
        "manifests": output_dir / "manifests",
        "temp": output_dir / "temp",
    }
    for path in paths.values():
        path.mkdir(parents=True, exist_ok=True)
    return paths


def make_file_plans(
    files: Iterable[Path],
    output_paths: dict[str, Path],
    overwrite: bool,
    duplicate_hashes: dict[str, int],
    existing_manifest: list[dict[str, Any]],
) -> list[FilePlan]:
    used: set[str] = set()
    plans: list[FilePlan] = []
    manifest_stems = {
        normalize_source_path(str(row.get("source_path", ""))): str(row.get("safe_output_stem", ""))
        for row in existing_manifest
        if row.get("source_path") and row.get("safe_output_stem")
    }

    for source_path in files:
        base = safe_stem(source_path.stem)
        prior_stem = manifest_stems.get(normalize_source_path(str(source_path)))
        if prior_stem and prior_stem not in used:
            base = prior_stem
        if base in {"logs", "manifests", "temp"}:
            base = f"{base}__audio"
        file_hash = short_hash(source_path)
        warnings: list[str] = []
        if duplicate_hashes.get(file_hash, 0) > 1:
            warnings.append("Exact duplicate-like audio content detected by file hash.")

        candidate = base
        counter = 1
        while candidate in used and not overwrite:
            warnings.append("Output filename collision occurred; generated unique output stem.")
            candidate = f"{base}__dup{counter:02d}"
            counter += 1
        used.add(candidate)
        plans.append(
            FilePlan(
                source_path=source_path,
                safe_output_stem=candidate,
                file_hash_short=file_hash,
                original_filename=source_path.name,
                warnings=warnings,
            )
        )
    return plans


def find_duplicate_hashes(files: Iterable[Path]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for path in files:
        digest = short_hash(path)
        counts[digest] = counts.get(digest, 0) + 1
    return counts


def probe_audio(path: Path, ffprobe_path: str | None) -> AudioMetadata:
    stat = path.stat()
    metadata = AudioMetadata(
        file_size_mb=round_float(stat.st_size / (1024 * 1024)),
        modified_time=datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
    )
    if ffprobe_path is None:
        metadata.warnings.append("ffprobe missing.")
        return metadata

    command = [
        ffprobe_path,
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    try:
        completed = subprocess.run(command, check=True, capture_output=True, text=True, timeout=60)
        data = json.loads(completed.stdout)
    except Exception as exc:
        metadata.warnings.append(f"Audio metadata is unreadable: {exc}")
        return metadata

    streams = data.get("streams") or []
    audio_stream = next((stream for stream in streams if stream.get("codec_type") == "audio"), None)
    fmt = data.get("format") or {}
    if audio_stream:
        metadata.codec = audio_stream.get("codec_name")
        metadata.sample_rate = audio_stream.get("sample_rate")
        channels = audio_stream.get("channels")
        metadata.channels = safe_int(channels)
        metadata.bitrate = audio_stream.get("bit_rate") or fmt.get("bit_rate")
        duration = audio_stream.get("duration") or fmt.get("duration")
        metadata.duration_seconds = safe_float(duration)
    else:
        metadata.warnings.append("Audio metadata is unreadable: no audio stream found.")
    return metadata


def prepare_working_audio(
    source_path: Path,
    temp_dir: Path,
    ffmpeg_path: str | None,
    normalize_audio: bool,
    logger: logging.Logger,
    output_format: str = "wav",
) -> Path | None:
    if ffmpeg_path is None:
        logger.warning("ffmpeg missing; using source audio directly.")
        return None

    if output_format not in {"wav", "flac"}:
        raise ValueError("Unsupported working-audio output format.")

    temp_dir.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix="transcribe_", suffix=f".{output_format}", dir=temp_dir)
    os.close(fd)
    temp_path = Path(temp_name)
    filters = ["loudnorm=I=-16:TP=-1.5:LRA=11"] if normalize_audio else []
    command = [
        ffmpeg_path,
        "-y",
        "-i",
        str(source_path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
    ]
    if filters:
        command.extend(["-af", ",".join(filters)])
    command.extend(["-f", output_format, str(temp_path)])
    try:
        subprocess.run(command, check=True, capture_output=True, text=True, timeout=3600)
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(exception_message(exc)) from exc
    return temp_path


def write_outputs(
    source_path: Path,
    plan: FilePlan,
    metadata: AudioMetadata,
    result: BackendResult,
    options: TranscriptionOptions,
    output_txt: Path,
    output_md: Path,
    output_json: Path,
    warnings: list[str],
) -> None:
    output_txt.parent.mkdir(parents=True, exist_ok=True)
    output_md.parent.mkdir(parents=True, exist_ok=True)
    output_json.parent.mkdir(parents=True, exist_ok=True)

    duration = metadata.duration_seconds or result.duration_seconds
    duration_hms = seconds_to_hms(duration)
    display_blocks = build_display_blocks(result.segments)
    transcript_text = "\n\n".join(block.text for block in display_blocks).strip()

    output_txt.write_text(
        "\n".join(
            [
                f"source_file: {source_path.name}",
                f"model: {options.model_name}",
                f"language: {options.language}",
                f"duration: {duration_hms}",
                "------------------",
                "",
                transcript_text,
                "",
            ]
        ),
        encoding="utf-8",
    )

    md_lines = [
        f"# Transcript: {source_path.name}",
        "",
        "## Metadata",
        "",
        f"* Source file: {source_path.name}",
        f"* Duration: {duration_hms}",
        f"* Model: {options.model_name}",
        f"* Language: {options.language}",
        f"* Device: {result.device_used}",
        f"* Compute type: {result.compute_type_used}",
        f"* Processing date: {utc_now()}",
        f"* Warnings: {join_warnings(warnings) or 'None'}",
        "",
        "## Timestamped Transcript",
        "",
    ]
    for block in display_blocks:
        md_lines.append(f"[{seconds_to_hms(block.start)} - {seconds_to_hms(block.end)}] {block.text}")
        md_lines.append("")
    output_md.write_text("\n".join(md_lines), encoding="utf-8")

    output_json.write_text(
        json.dumps(
            {
                "source_file": source_path.name,
                "safe_output_stem": plan.safe_output_stem,
                "duration_seconds": round_float(duration),
                "duration_hms": duration_hms,
                "model": options.model_name,
                "language": options.language,
                "device": result.device_used,
                "compute_type": result.compute_type_used,
                "segments": [segment.to_json() for segment in result.segments],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def merge_segments_for_display(segments: list[Segment]) -> list[DisplayBlock]:
    """Merge tiny Whisper segments into readable transcript blocks without rewriting text."""
    blocks: list[DisplayBlock] = []
    current_start: float | None = None
    current_end: float | None = None
    current_parts: list[str] = []

    for segment in segments:
        text = segment.text.strip()
        if not text:
            continue

        if current_start is None:
            current_start = segment.start
            current_end = segment.end
            current_parts = [text]
            continue

        assert current_end is not None
        current_text = normalize_joined_text(current_parts)
        pause = max(0.0, segment.start - current_end)
        should_break_before = (
            ends_like_sentence(current_text)
            and len(current_text) >= 90
            and pause >= 1.2
        )

        if should_break_before:
            blocks.append(DisplayBlock(current_start, current_end, current_text))
            current_start = segment.start
            current_end = segment.end
            current_parts = [text]
            continue

        current_parts.append(text)
        current_end = segment.end
        current_text = normalize_joined_text(current_parts)
        current_duration = current_end - current_start

        should_break_after = (
            ends_like_sentence(current_text)
            and (len(current_text) >= 180 or current_duration >= 14)
        )
        force_break = len(current_text) >= 360 or current_duration >= 35
        if should_break_after or force_break:
            blocks.append(DisplayBlock(current_start, current_end, current_text))
            current_start = None
            current_end = None
            current_parts = []

    if current_start is not None and current_end is not None and current_parts:
        blocks.append(DisplayBlock(current_start, current_end, normalize_joined_text(current_parts)))

    return blocks


def build_display_blocks(segments: list[Segment]) -> list[DisplayBlock]:
    non_empty = [segment for segment in segments if segment.text.strip()]
    if not non_empty:
        return []
    total_duration = sum(max(0.0, segment.end - segment.start) for segment in non_empty)
    average_duration = total_duration / len(non_empty)
    is_over_fragmented = len(non_empty) >= 80 or average_duration < 5.0
    if not is_over_fragmented:
        return [
            DisplayBlock(segment.start, segment.end, segment.text.strip())
            for segment in non_empty
        ]
    return merge_segments_for_display(non_empty)


def normalize_joined_text(parts: list[str]) -> str:
    text = " ".join(part.strip() for part in parts if part.strip())
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r"\(\s+", "(", text)
    text = re.sub(r"\s+\)", ")", text)
    return re.sub(r"\s+", " ", text).strip()


def ends_like_sentence(text: str) -> bool:
    return text.rstrip().endswith((".", "?", "!", ":", "…"))


def build_manifest_row(
    plan: FilePlan,
    metadata: AudioMetadata,
    options: TranscriptionOptions,
    output_txt: Path,
    output_md: Path,
    output_json: Path,
    status: str,
    started_at: str,
    finished_at: str,
    warnings: list[str],
    device_used: str,
    compute_type_used: str,
    error_message: str = "",
    wall_time_seconds: float | None = None,
    realtime_factor: float | None = None,
    audio_seconds_per_second: float | None = None,
    duration_override: float | None = None,
) -> ManifestRow:
    duration = duration_override if duration_override is not None else metadata.duration_seconds
    return ManifestRow(
        original_filename=plan.original_filename or plan.source_path.name,
        safe_output_stem=plan.safe_output_stem,
        source_path=normalize_source_path(str(plan.source_path)),
        output_txt_path=normalize_source_path(str(output_txt)),
        output_md_path=normalize_source_path(str(output_md)),
        output_json_path=normalize_source_path(str(output_json)),
        duration_seconds=round_float(duration),
        duration_hms=seconds_to_hms(duration),
        codec=metadata.codec,
        sample_rate=metadata.sample_rate,
        channels=metadata.channels,
        bitrate=metadata.bitrate,
        file_size_mb=metadata.file_size_mb,
        modified_time=metadata.modified_time,
        file_hash_short=plan.file_hash_short,
        model_name=options.model_name,
        device_requested=options.device,
        device_used=device_used,
        compute_type_requested=options.compute_type,
        compute_type_used=compute_type_used,
        vad_filter=options.vad_filter,
        beam_size=options.beam_size,
        transcription_status=status,
        processing_started_at=started_at,
        processing_finished_at=finished_at,
        wall_time_seconds=round_float(wall_time_seconds),
        realtime_factor=round_float(realtime_factor),
        audio_seconds_per_second=round_float(audio_seconds_per_second),
        warnings=join_warnings(warnings),
        error_message=error_message,
    )


def build_unsupported_manifest_row(
    unsupported: UnsupportedFile,
    output_paths: dict[str, Path],
    options: TranscriptionOptions,
) -> ManifestRow:
    display_name = unsupported.original_filename or unsupported.source_path.name or str(unsupported.source_path)
    safe_output_stem = safe_stem(Path(display_name).stem)
    output_txt, output_md, output_json = output_file_paths(
        output_paths,
        safe_output_stem,
        create_dirs=False,
    )
    now = utc_now()
    return ManifestRow(
        original_filename=display_name,
        safe_output_stem=safe_output_stem,
        source_path=normalize_source_path(str(unsupported.source_path)),
        output_txt_path=normalize_source_path(str(output_txt)),
        output_md_path=normalize_source_path(str(output_md)),
        output_json_path=normalize_source_path(str(output_json)),
        duration_seconds=None,
        duration_hms="",
        codec=None,
        sample_rate=None,
        channels=None,
        bitrate=None,
        file_size_mb=None,
        modified_time=None,
        file_hash_short="",
        model_name=options.model_name,
        device_requested=options.device,
        device_used="",
        compute_type_requested=options.compute_type,
        compute_type_used="",
        vad_filter=options.vad_filter,
        beam_size=options.beam_size,
        transcription_status="unsupported",
        processing_started_at=now,
        processing_finished_at=now,
        wall_time_seconds=None,
        realtime_factor=None,
        audio_seconds_per_second=None,
        warnings=unsupported.reason,
        error_message="",
    )


def write_manifests(manifest_dir: Path, rows: list[ManifestRow]) -> None:
    manifest_dir.mkdir(parents=True, exist_ok=True)
    merged: dict[tuple[str, str], dict[str, Any]] = {}
    for row in read_existing_manifest(manifest_dir):
        key = (
            normalize_source_path(str(row.get("source_path", ""))),
            str(row.get("safe_output_stem", "")),
        )
        merged[key] = row
    for row in rows:
        row_dict = asdict(row)
        key = (
            normalize_source_path(str(row_dict["source_path"])),
            row_dict["safe_output_stem"],
        )
        merged[key] = row_dict
    dict_rows = list(merged.values())
    csv_path = manifest_dir / "manifest.csv"
    json_path = manifest_dir / "manifest.json"

    fieldnames = list(ManifestRow.__dataclass_fields__.keys())
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(dict_rows)

    json_path.write_text(json.dumps(dict_rows, ensure_ascii=False, indent=2), encoding="utf-8")


def append_status(status_rows: list[dict[str, Any]], row: ManifestRow) -> None:
    set_status_row(
        status_rows,
        file=row.original_filename,
        source=row.source_path,
        duration=row.duration_hms,
        duration_seconds=row.duration_seconds,
        status=row.transcription_status,
        warning=row.warnings,
        error=row.error_message,
        output=row.safe_output_stem,
        output_txt_path=row.output_txt_path,
        output_md_path=row.output_md_path,
        output_json_path=row.output_json_path,
    )


def set_status_row(
    status_rows: list[dict[str, Any]],
    *,
    file: str,
    source: str,
    status: str,
    duration: str | None = None,
    duration_seconds: float | None = None,
    warning: str = "",
    error: str = "",
    output: str = "",
    output_txt_path: str = "",
    output_md_path: str = "",
    output_json_path: str = "",
) -> None:
    row = {
        "file": file,
        "source": source,
        "duration": duration or "",
        "duration_seconds": round_float(duration_seconds),
        "status": status,
        "warning": warning,
        "error": error,
        "warning/error": error or warning,
        "output": output,
        "output_txt_path": output_txt_path,
        "output_md_path": output_md_path,
        "output_json_path": output_json_path,
    }
    for index, existing in enumerate(status_rows):
        if existing.get("source") == source:
            merged = dict(existing)
            merged.update({key: value for key, value in row.items() if value not in ("", None)})
            merged["status"] = status
            merged["warning/error"] = merged.get("error") or merged.get("warning") or ""
            status_rows[index] = merged
            return
    status_rows.append(row)


def setup_run_logger(log_path: Path) -> logging.Logger:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("mediscribe")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    file_handler = logging.FileHandler(log_path, encoding="utf-8")
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)
    return logger


class LogBuffer(logging.Handler):
    def __init__(self, capacity: int = 120) -> None:
        super().__init__()
        self.capacity = capacity
        self.lines: list[str] = []
        self.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))

    def emit(self, record: logging.LogRecord) -> None:
        self.lines.append(self.format(record))
        self.lines = self.lines[-self.capacity :]

    def text(self) -> str:
        return "\n".join(self.lines[-80:])


def emit(
    callback: ProgressCallback | None,
    message: str,
    status_rows: list[dict[str, Any]],
    metrics: RunMetrics,
    model_status: str,
    current_file: str = "",
    log_tail: str = "",
    progress: float = 0.0,
) -> None:
    if callback is None:
        return
    callback(
        ProgressEvent(
            message=message,
            current_file=current_file,
            status_rows=list(status_rows),
            metrics=metrics,
            model_status=model_status,
            log_tail=log_tail,
            progress=max(0.0, min(1.0, progress)),
        )
    )


def read_existing_manifest(manifest_dir: Path) -> list[dict[str, Any]]:
    json_path = manifest_dir / "manifest.json"
    if not json_path.exists():
        return []
    try:
        data = json.loads(json_path.read_text(encoding="utf-8"))
    except Exception:
        return []
    return data if isinstance(data, list) else []


def existing_output_count(output_txt: Path, output_md: Path, output_json: Path) -> int:
    return sum(path.exists() for path in (output_txt, output_md, output_json))


def output_file_paths(
    output_paths: dict[str, Path],
    safe_output_stem: str,
    create_dirs: bool = True,
) -> tuple[Path, Path, Path]:
    audio_dir = output_paths["root"] / safe_output_stem
    transcript_dir = audio_dir / "transcripts"
    segments_dir = audio_dir / "segments"
    if create_dirs:
        transcript_dir.mkdir(parents=True, exist_ok=True)
        segments_dir.mkdir(parents=True, exist_ok=True)
    return (
        transcript_dir / f"{safe_output_stem}.txt",
        transcript_dir / f"{safe_output_stem}.md",
        segments_dir / f"{safe_output_stem}.segments.json",
    )


def next_available_stem(base: str, output_paths: dict[str, Path]) -> str:
    counter = 1
    while True:
        candidate = f"{base}__dup{counter:02d}"
        if existing_output_count(*output_file_paths(output_paths, candidate, create_dirs=False)) == 0:
            return candidate
        counter += 1


def safe_stem(stem: str) -> str:
    clean = re.sub(r"[^A-Za-z0-9._-]+", "_", stem.strip())
    clean = re.sub(r"_+", "_", clean).strip("._-")
    return clean or "audio"


def short_hash(path: Path, length: int = 8) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()[:length]


def safe_float(value: Any) -> float | None:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    return numeric if math.isfinite(numeric) else None


def safe_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def normalize_source_path(path: str) -> str:
    try:
        return str(Path(path).expanduser().resolve())
    except Exception:
        return path


def exception_message(exc: BaseException) -> str:
    if isinstance(exc, subprocess.CalledProcessError):
        stderr = (exc.stderr or "").strip()
        if stderr:
            return stderr[-2000:]
    return str(exc)


def seconds_to_hms(seconds: float | int | None) -> str:
    if seconds is None or not math.isfinite(float(seconds)):
        return ""
    total = max(0, int(round(float(seconds))))
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def round_float(value: float | int | None, digits: int = 3) -> float | None:
    if value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(numeric):
        return None
    return round(numeric, digits)


def join_warnings(warnings: list[str]) -> str:
    seen: list[str] = []
    for warning in warnings:
        if warning and warning not in seen:
            seen.append(warning)
    return " | ".join(seen)


def resolve_device(requested: str) -> str:
    if requested in {"cuda", "cpu"}:
        if requested == "cuda" and not cuda_available():
            return "cpu"
        return requested
    return "cuda" if cuda_available() else "cpu"


def resolve_compute_type(requested: str, device: str) -> str:
    if requested != "auto":
        return requested
    return "float16" if device == "cuda" else "int8"


def cuda_available() -> bool:
    try:
        import ctranslate2

        return ctranslate2.get_cuda_device_count() > 0
    except Exception:
        return False


def utc_now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"
