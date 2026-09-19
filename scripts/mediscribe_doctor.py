"""Environment diagnostics for the portable MediScribe workflow."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import shutil
import sys
from pathlib import Path
from typing import Mapping, Sequence


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from shared.transcribe_core import OPENROUTER_DEFAULT_API_KEY_ENV_VAR  # noqa: E402


def _check_import(module_name: str, package_name: str | None = None) -> dict[str, str]:
    available = importlib.util.find_spec(module_name) is not None
    return {
        "status": "ok" if available else "missing",
        "detail": f"{package_name or module_name} is importable." if available else f"Install {package_name or module_name}.",
    }


def _check_command(command: str) -> dict[str, str]:
    path = shutil.which(command)
    return {
        "status": "ok" if path else "missing",
        "detail": f"{command} is available." if path else f"Install {command} and ensure it is on PATH.",
    }


def inspect_environment(
    profile: str,
    input_path: str | Path,
    output_path: str | Path,
    *,
    dry_run: bool = False,
    environ: Mapping[str, str] | None = None,
    api_key_env: str = OPENROUTER_DEFAULT_API_KEY_ENV_VAR,
) -> dict[str, object]:
    """Return a JSON-safe report that never includes credential values."""

    if profile not in {"cloud", "local"}:
        raise ValueError("profile must be cloud or local")
    env = os.environ if environ is None else environ
    input_resolved = Path(input_path).expanduser()
    output_resolved = Path(output_path).expanduser()
    checks: dict[str, dict[str, str]] = {
        "python": {
            "status": "ok" if sys.version_info >= (3, 10) else "missing",
            "detail": f"Python {sys.version.split()[0]} detected." if sys.version_info >= (3, 10) else "Python 3.10 or newer is required.",
        },
        "yaml": _check_import("yaml", "PyYAML"),
        "certifi": _check_import("certifi"),
        "ffmpeg": _check_command("ffmpeg"),
        "ffprobe": _check_command("ffprobe"),
        "input": {
            "status": "ok" if input_resolved.exists() else "missing",
            "detail": "Input path exists." if input_resolved.exists() else "Input path does not exist.",
        },
        "output": {"status": "unknown", "detail": "Output path was not checked."},
    }

    if profile == "local":
        checks["faster_whisper"] = _check_import("faster_whisper", "faster-whisper")
    else:
        checks["faster_whisper"] = {"status": "not_required", "detail": "Cloud profile does not load a local Whisper model."}

    try:
        output_resolved.mkdir(parents=True, exist_ok=True)
        writable = os.access(output_resolved, os.W_OK)
        checks["output"] = {
            "status": "ok" if writable else "missing",
            "detail": "Output path is writable." if writable else "Output path is not writable.",
        }
    except OSError as exc:
        checks["output"] = {"status": "missing", "detail": f"Output path cannot be created: {exc}"}

    if profile == "cloud":
        configured = bool(str(env.get(api_key_env, "")).strip())
        if configured:
            checks["api_key"] = {"status": "configured", "detail": f"{api_key_env} is configured."}
        elif dry_run:
            checks["api_key"] = {"status": "warning", "detail": f"{api_key_env} is absent; dry-run does not send audio."}
        else:
            checks["api_key"] = {"status": "missing", "detail": f"Set {api_key_env} for cloud transcription."}
    else:
        checks["api_key"] = {"status": "not_required", "detail": "Local profile does not require an API key."}

    blocking_statuses = {"missing", "error"}
    ok = all(check["status"] not in blocking_statuses for check in checks.values())
    return {
        "ok": ok,
        "profile": profile,
        "dry_run": dry_run,
        "input": str(input_resolved),
        "output": str(output_resolved),
        "checks": checks,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", choices=("cloud", "local"), default="cloud")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--api-key-env", default=OPENROUTER_DEFAULT_API_KEY_ENV_VAR)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true", dest="as_json")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    report = inspect_environment(
        args.profile,
        args.input,
        args.output,
        dry_run=args.dry_run,
        api_key_env=args.api_key_env,
    )
    if args.as_json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print(f"MediScribe {args.profile} environment: {'READY' if report['ok'] else 'NOT READY'}")
        for name, check in report["checks"].items():
            print(f"- {name}: {check['status']} — {check['detail']}")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
