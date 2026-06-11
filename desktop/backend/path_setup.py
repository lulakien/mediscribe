"""Runtime path helpers for source and packaged desktop layouts."""

from __future__ import annotations

import os
import sys
from pathlib import Path


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

