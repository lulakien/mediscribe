"""Runtime path helpers for source and packaged desktop layouts."""

from __future__ import annotations

import os
import sys
from pathlib import Path


def configure_runtime_environment() -> Path | None:
    """Configure private cache defaults when Electron provides a data root.

    ``MEDISCRIBE_DATA_DIR`` is the boundary between separate desktop
    installations. Keep the existing user-level defaults for direct backend
    development, but make packaged/Electron launches self-contained.
    """
    raw_data_dir = os.environ.get("MEDISCRIBE_DATA_DIR")
    if not raw_data_dir:
        return None

    data_dir = Path(raw_data_dir).expanduser().resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("HF_HOME", str(data_dir / "huggingface"))
    return data_dir


def add_shared_to_path() -> None:
    """Add the shared core directory for both repo and Electron resources layouts."""
    here = Path(__file__).resolve()
    candidates = []

    env_path = os.environ.get("MEDISCRIBE_SHARED_DIR")
    if env_path:
        candidates.append(Path(env_path).expanduser())

    candidates.extend(
        [
            here.parent.parent / "shared",          # packaged: resources/shared
            here.parent.parent.parent / "shared",   # source: repo/shared
        ]
    )

    for candidate in candidates:
        if (candidate / "transcribe_core.py").exists():
            path_str = str(candidate)
            if path_str not in sys.path:
                sys.path.insert(0, path_str)
            return
