"""Create a portable MediScribe headless virtual environment."""

from __future__ import annotations

import argparse
import subprocess
import sys
import venv
from pathlib import Path
from typing import Sequence


REPO_ROOT = Path(__file__).resolve().parents[1]


def _venv_python(venv_path: Path) -> Path:
    return venv_path / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", choices=("cloud", "local"), default="cloud")
    parser.add_argument("--venv", type=Path, default=Path(".venv-headless"))
    parser.add_argument("--dry-run", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    venv_path = args.venv.expanduser()
    if not venv_path.is_absolute():
        venv_path = (Path.cwd() / venv_path).resolve()
    requirements_name = "requirements-headless-local.txt" if args.profile == "local" else "requirements-headless.txt"
    requirements_path = REPO_ROOT / requirements_name
    python_path = _venv_python(venv_path)

    if args.dry_run:
        print(f"virtual_environment={venv_path}")
        print(f"requirements={requirements_path}")
        print(f"install_command={python_path} -m pip install -r {requirements_path}")
        return 0

    if not requirements_path.exists():
        raise SystemExit(f"Requirements file is missing: {requirements_path}")
    venv.EnvBuilder(with_pip=True, clear=False).create(venv_path)
    subprocess.run(
        [str(python_path), "-m", "pip", "install", "-r", str(requirements_path)],
        check=True,
    )
    print(f"HEADLESS_BOOTSTRAP_OK venv={venv_path}")
    print(f"Next: {python_path} scripts/mediscribe_doctor.py --profile {args.profile} --input work/input --output work/output")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
