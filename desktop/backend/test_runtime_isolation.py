"""Regression tests for per-sandbox runtime state."""

from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from config_manager import ConfigManager
from path_setup import configure_runtime_environment


def test_config_manager_uses_mediscribe_data_dir(monkeypatch, tmp_path: Path) -> None:
    """The Electron-provided data root must not fall back to shared user state."""
    monkeypatch.setenv("MEDISCRIBE_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

    manager = ConfigManager()

    assert manager.path == tmp_path / "config.json"


def test_runtime_environment_derives_a_private_huggingface_cache(
    monkeypatch, tmp_path: Path
) -> None:
    """A sandbox data root should provide a separate default model cache."""
    monkeypatch.setenv("MEDISCRIBE_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("HF_HOME", raising=False)

    resolved = configure_runtime_environment()

    assert resolved == tmp_path
    assert os.environ["HF_HOME"] == str(tmp_path / "huggingface")
