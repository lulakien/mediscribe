"""Portable, provider-explicit batch runner for MediScribe."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterable, Sequence


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from shared.transcribe_core import (  # noqa: E402
    AUDIO_EXTENSIONS,
    OPENROUTER_DEFAULT_MODEL,
    OPENROUTER_MAX_TIMEOUT_SECONDS,
    OPENROUTER_SUPPORTED_MODELS,
    OPENROUTER_TRANSCRIBE_BACKEND,
    ManifestRow,
    TranscriptionOptions,
    collect_audio_files_from_folder,
    run_batch,
    transcribe_files,
)


_ENV_VAR_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_FAILED_STATUSES = frozenset({"failed", "unsupported"})


def _bounded_timeout(value: float) -> float:
    timeout = float(value)
    if timeout <= 0:
        raise ValueError("timeout-seconds must be greater than zero")
    return min(timeout, OPENROUTER_MAX_TIMEOUT_SECONDS)


def _validate_api_key_env(value: str) -> str:
    if not _ENV_VAR_NAME_RE.fullmatch(value):
        raise ValueError("api-key-env must be a valid environment-variable name")
    return value


def build_options(
    profile: str,
    model_name: str | None,
    language: str,
    api_key_env: str,
    timeout_seconds: float,
) -> TranscriptionOptions:
    """Build explicit provider options without reading or storing a key."""

    if profile not in {"cloud", "local"}:
        raise ValueError("profile must be cloud or local")
    if not language.strip():
        raise ValueError("language must not be empty")

    if profile == "cloud":
        model = model_name or OPENROUTER_DEFAULT_MODEL
        if model not in OPENROUTER_SUPPORTED_MODELS:
            supported = ", ".join(sorted(OPENROUTER_SUPPORTED_MODELS))
            raise ValueError(f"unsupported cloud model; choose one of: {supported}")
        return TranscriptionOptions(
            backend=OPENROUTER_TRANSCRIBE_BACKEND,
            model_name=model,
            device="remote",
            compute_type="api",
            language=language.strip(),
            api_key_env_var=_validate_api_key_env(api_key_env),
            timeout_seconds=_bounded_timeout(timeout_seconds),
        )

    return TranscriptionOptions(
        backend="local_whisper",
        model_name=model_name or "large-v3",
        device="auto",
        compute_type="auto",
        language=language.strip(),
    )


def _progress(event: Any) -> None:
    percentage = max(0.0, min(1.0, float(event.progress))) * 100
    print(f"[{percentage:6.2f}%] {event.message}", flush=True)


def _dedupe_paths(paths: Iterable[Path]) -> list[Path]:
    result: list[Path] = []
    seen: set[str] = set()
    for path in paths:
        resolved = str(path.expanduser().resolve())
        if resolved not in seen:
            seen.add(resolved)
            result.append(Path(resolved))
    return result


def _collect_explicit_files(inputs: Sequence[Path]) -> list[Path]:
    candidates: list[Path] = []
    for raw_path in inputs:
        path = raw_path.expanduser()
        if path.is_dir():
            candidates.extend(collect_audio_files_from_folder(path))
        elif path.is_file() and path.suffix.lower() in AUDIO_EXTENSIONS:
            candidates.append(path)
    return _dedupe_paths(candidates)


def exit_code_for_rows(rows: Sequence[ManifestRow | Any]) -> tuple[int, list[str]]:
    failed = [
        str(getattr(row, "original_filename", "unknown"))
        for row in rows
        if str(getattr(row, "transcription_status", "")) in _FAILED_STATUSES
    ]
    return (1 if failed else 0), failed


def _summary(rows: Sequence[ManifestRow | Any], exit_code: int, failed: list[str]) -> dict[str, Any]:
    statuses = Counter(str(getattr(row, "transcription_status", "unknown")) for row in rows)
    return {
        "exit_code": exit_code,
        "rows": len(rows),
        "statuses": dict(sorted(statuses.items())),
        "failed_files": failed,
    }


def run_headless(
    input_path: str | Path | Sequence[str | Path],
    output_folder: str | Path,
    *,
    profile: str = "cloud",
    model_name: str | None = None,
    language: str = "tr",
    api_key_env: str = "OPENROUTER_API_KEY",
    timeout_seconds: float = 60.0,
    normalize_audio: bool = False,
    overwrite: bool = False,
    dry_run: bool = False,
    progress_callback: Any = _progress,
) -> int:
    """Run one deterministic batch and return a shell exit code."""

    options = build_options(profile, model_name, language, api_key_env, timeout_seconds)
    if isinstance(input_path, (str, Path)):
        inputs = [Path(input_path)]
    else:
        inputs = [Path(value) for value in input_path]
    inputs = [path.expanduser() for path in inputs]
    if not inputs:
        print("No input paths were supplied.", file=sys.stderr)
        return 2

    output_dir = Path(output_folder).expanduser()
    only_directory = len(inputs) == 1 and inputs[0].is_dir()
    if only_directory:
        supported = collect_audio_files_from_folder(inputs[0])
        if not supported:
            print(f"No supported audio files found in {inputs[0]}.", file=sys.stderr)
            return 2
        rows = run_batch(
            input_folder=inputs[0],
            output_folder=output_dir,
            options=options,
            normalize_audio=normalize_audio,
            overwrite=overwrite,
            dry_run=dry_run,
            progress_callback=progress_callback,
        )
    else:
        files = _collect_explicit_files(inputs)
        if not files:
            print("No supported audio files were found in the supplied input paths.", file=sys.stderr)
            return 2
        rows = transcribe_files(
            file_paths=files,
            output_folder=output_dir,
            options=options,
            normalize_audio=normalize_audio,
            overwrite=overwrite,
            dry_run=dry_run,
            progress_callback=progress_callback,
            input_description=", ".join(str(path) for path in inputs),
        )

    exit_code, failed = exit_code_for_rows(rows)
    if failed:
        print("Failed files: " + ", ".join(failed), file=sys.stderr)
    return exit_code


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        action="append",
        required=True,
        type=Path,
        help="Input audio directory or file; repeat for multiple paths.",
    )
    parser.add_argument("--output", required=True, type=Path, help="Output artifact directory.")
    parser.add_argument("--profile", choices=("cloud", "local"), default="cloud")
    parser.add_argument("--model", dest="model_name")
    parser.add_argument("--language", default="tr")
    parser.add_argument("--api-key-env", default="OPENROUTER_API_KEY")
    parser.add_argument("--timeout-seconds", type=float, default=OPENROUTER_MAX_TIMEOUT_SECONDS)
    parser.add_argument("--normalize-audio", action="store_true")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json-summary", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        options = build_options(
            args.profile,
            args.model_name,
            args.language,
            args.api_key_env,
            args.timeout_seconds,
        )
        del options
        inputs = args.input
        if len(inputs) == 1 and inputs[0].is_dir():
            supported_count = len(collect_audio_files_from_folder(inputs[0]))
        else:
            supported_count = len(_collect_explicit_files(inputs))
        if supported_count == 0:
            print("No supported audio files were found in the supplied input paths.", file=sys.stderr)
            return 2
        exit_code = run_headless(
            inputs,
            args.output,
            profile=args.profile,
            model_name=args.model_name,
            language=args.language,
            api_key_env=args.api_key_env,
            timeout_seconds=args.timeout_seconds,
            normalize_audio=args.normalize_audio,
            overwrite=args.overwrite,
            dry_run=args.dry_run,
        )
        if args.json_summary:
            print(json.dumps({"exit_code": exit_code, "input_count": supported_count}, sort_keys=True))
        return exit_code
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
