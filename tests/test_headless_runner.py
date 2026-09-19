"""Tests for the portable MediScribe headless workflow."""

from __future__ import annotations

import json
from types import SimpleNamespace

from scripts.mediscribe_doctor import inspect_environment
from scripts.mediscribe_headless import (
    build_options,
    exit_code_for_rows,
    run_headless,
)


def test_cloud_profile_selects_microsoft_openrouter_without_local_model():
    options = build_options(
        profile="cloud",
        model_name=None,
        language="tr",
        api_key_env="OPENROUTER_API_KEY",
        timeout_seconds=60.0,
    )

    assert options.backend == "openrouter_transcribe"
    assert options.model_name == "microsoft/mai-transcribe-2"
    assert options.device == "remote"
    assert options.compute_type == "api"


def test_local_profile_selects_faster_whisper_defaults():
    options = build_options(
        profile="local",
        model_name=None,
        language="tr",
        api_key_env="OPENROUTER_API_KEY",
        timeout_seconds=60.0,
    )

    assert options.backend == "local_whisper"
    assert options.model_name == "large-v3"
    assert options.device == "auto"
    assert options.compute_type == "auto"


def test_doctor_never_serializes_api_key(monkeypatch, tmp_path):
    monkeypatch.setenv("OPENROUTER_API_KEY", "synthetic-secret-value")

    report = inspect_environment(
        "cloud",
        tmp_path / "input",
        tmp_path / "output",
        dry_run=True,
    )

    assert "synthetic-secret-value" not in json.dumps(report)
    assert report["checks"]["api_key"]["status"] == "configured"


def test_headless_dry_run_uses_shared_manifest_contract(tmp_path):
    input_dir = tmp_path / "input"
    input_dir.mkdir()
    (input_dir / "sample.m4a").write_bytes(b"not real audio")
    output_dir = tmp_path / "output"

    assert run_headless(input_dir, output_dir, profile="cloud", dry_run=True) == 0

    manifest = json.loads((output_dir / "manifests" / "manifest.json").read_text())
    assert manifest[0]["transcription_status"] == "scan_only"


def test_failed_rows_return_nonzero_and_name_failed_files():
    rows = [SimpleNamespace(transcription_status="failed", original_filename="bad.m4a")]

    code, failed = exit_code_for_rows(rows)

    assert code == 1
    assert failed == ["bad.m4a"]
