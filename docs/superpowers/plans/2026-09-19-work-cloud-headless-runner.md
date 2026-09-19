# ChatGPT Work Headless Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use $executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a portable headless bootstrap, doctor, and batch runner for ChatGPT Work agents while preserving the existing Electron desktop and Apple MLX workflows.

**Architecture:** The new CLI will import the existing `shared.transcribe_core` engine rather than duplicate transcription or output logic. A cloud profile will explicitly select the existing Microsoft/OpenRouter adapter and read only an environment-variable key; a local profile will optionally use faster-whisper. The desktop path remains unchanged except for documentation and the stale agent-guide boundary.

**Tech Stack:** Python 3.10+, argparse, venv, PyYAML, certifi, optional faster-whisper, pytest, GitHub Actions on Ubuntu, existing Electron/FastAPI/MLX desktop stack.

---

### Task 1: Add portable headless dependencies and command modules

**Files:**
- Create: `requirements-headless.txt`
- Create: `requirements-headless-local.txt`
- Create: `scripts/__init__.py`
- Create: `scripts/bootstrap_headless.py`
- Create: `scripts/mediscribe_doctor.py`
- Create: `scripts/mediscribe_headless.py`
- Test: `tests/test_headless_runner.py`

- [ ] **Step 1: Write failing unit tests for profile resolution, secret-safe diagnostics, dry-run output, and failure exit codes.**

  The tests must import the three script modules from the repository root and cover these exact behaviors:

  ```python
  def test_cloud_profile_selects_microsoft_openrouter_without_local_model():
      options = build_options(profile="cloud", model_name=None, language="tr", api_key_env="OPENROUTER_API_KEY")
      assert options.backend == "openrouter_transcribe"
      assert options.model_name == "microsoft/mai-transcribe-2"
      assert options.device == "remote"
      assert options.compute_type == "api"

  def test_doctor_never_serializes_api_key(monkeypatch, tmp_path):
      monkeypatch.setenv("OPENROUTER_API_KEY", "synthetic-secret-value")
      report = inspect_environment("cloud", tmp_path / "input", tmp_path / "output", dry_run=True)
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
  ```

- [ ] **Step 2: Run the focused tests and verify they fail because the headless modules do not exist.**

  Run:

  ```bash
  python3 -m pytest -q tests/test_headless_runner.py
  ```

  Expected result: collection failure identifying the missing `scripts` modules or exported functions.

- [ ] **Step 3: Add the minimal portable requirement files.**

  `requirements-headless.txt` must contain only:

  ```text
  PyYAML>=6.0.3,<7
  certifi>=2024.2.2
  ```

  `requirements-headless-local.txt` must contain:

  ```text
  -r requirements-headless.txt
  faster-whisper>=1.2.1,<2
  ```

- [ ] **Step 4: Implement `scripts/mediscribe_headless.py`.**

  Add a repository-root import path, `build_options()`, `build_parser()`, `run_headless()`, `exit_code_for_rows()`, and `main()`. The CLI must expose:

  ```text
  --input PATH             repeatable; one directory or explicit audio files
  --output PATH            required output directory
  --profile {cloud,local}  default cloud
  --model MODEL            cloud defaults to microsoft/mai-transcribe-2; local defaults to large-v3
  --language CODE          default tr
  --api-key-env NAME       default OPENROUTER_API_KEY; cloud only
  --timeout-seconds N      cloud timeout, bounded by the shared engine
  --normalize-audio
  --overwrite
  --dry-run
  --json-summary
  ```

  The cloud profile must construct `TranscriptionOptions` with backend `openrouter_transcribe`, device `remote`, compute type `api`, the selected model, and the configured environment-variable name. The local profile must construct `TranscriptionOptions` with backend `local_whisper`, device `auto`, compute type `auto`, and the selected model.

  Directory input must call `run_batch()`; explicit file input must call `transcribe_files()` after filtering to supported `AUDIO_EXTENSIONS`. Progress output may include filenames and statuses but must never include environment values, request headers, or raw provider responses. A run with no supported files returns exit code 2. Any row whose `transcription_status` is `failed` or `unsupported` returns exit code 1 and reports the filenames. Dry-run rows return exit code 0.

- [ ] **Step 5: Implement `scripts/mediscribe_doctor.py`.**

  Export `inspect_environment(profile, input_path, output_path, dry_run=False, environ=None)` and a CLI with `--profile`, `--input`, `--output`, `--dry-run`, and `--json`. It must check Python version, importability of `yaml` and `certifi`, `faster_whisper` only for the local profile, `ffmpeg`, `ffprobe`, input path, output path creation/writability, and cloud API-key presence. A missing cloud key is an error in normal mode and a warning in dry-run mode. The report must contain only booleans, statuses, safe paths, and human-readable remediation text; never credential values.

- [ ] **Step 6: Implement `scripts/bootstrap_headless.py`.**

  Add a cross-platform `venv` bootstrapper with `--profile {cloud,local}`, `--venv PATH` defaulting to `.venv-headless`, and `--dry-run`. It must create/reuse the selected virtual environment, select the correct requirements file, and run that environment's `python -m pip install -r ...`. It must print the environment path and next commands, not environment secrets. In dry-run mode it must print the planned command without creating a virtual environment.

- [ ] **Step 7: Run the focused tests and verify they pass.**

  Run:

  ```bash
  python3 -m pytest -q tests/test_headless_runner.py
  python3 scripts/mediscribe_headless.py --help
  python3 scripts/mediscribe_doctor.py --help
  python3 scripts/bootstrap_headless.py --profile cloud --dry-run
  ```

  Expected result: all focused tests pass, help exits zero, and bootstrap dry-run prints the cloud requirements path without creating `.venv-headless`.

- [ ] **Step 8: Commit the headless implementation.**

  ```bash
  git add requirements-headless.txt requirements-headless-local.txt scripts tests/test_headless_runner.py
  git commit -m "feat: add portable headless transcription runner"
  ```

### Task 2: Document Work Cloud and preserve desktop workflows

**Files:**
- Create: `docs/WORK_CLOUD_RUNBOOK.md`
- Modify: `README.md`
- Modify: `docs/QUICK_START.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Add the Work Cloud runbook.**

  Document the exact workflow:

  ```bash
  git clone https://github.com/lulakien/mediscribe.git
  cd mediscribe
  python3 scripts/bootstrap_headless.py --profile cloud
  .venv-headless/bin/python scripts/mediscribe_doctor.py --profile cloud --input work/input --output work/output
  .venv-headless/bin/python scripts/mediscribe_headless.py --profile cloud --input work/input --output work/output
  ```

  Also document the Windows virtual-environment executable path, the dry-run command, resume behavior, artifact paths, `OPENROUTER_API_KEY` provisioning, Microsoft model selection, the requirement for `ffmpeg`/`ffprobe`, and the fact that Work Cloud must have shell and public-network access enabled. Do not place a real key, transcript, audio path, or personal account identifier in the document.

- [ ] **Step 2: Update the root README and quick start.**

  Add a short “Choose your execution mode” section linking the runbook. State that desktop users should follow the existing app setup, while agents should use the headless bootstrap and runner. Keep the macOS MLX instructions and local-first default unchanged.

- [ ] **Step 3: Update `AGENTS.md`.**

  Replace the stale statement that non-local transcription backends are unsupported with the current boundary: cloud/API transcription is supported only through the explicit OpenRouter Microsoft adapter, remains opt-in, and must use the headless runner for agent workflows. Keep the existing output and security contracts.

- [ ] **Step 4: Validate documentation commands and commit.**

  ```bash
  rg -n "WORK_CLOUD_RUNBOOK|mediscribe_headless|mediscribe_doctor|bootstrap_headless" README.md docs/QUICK_START.md AGENTS.md docs/WORK_CLOUD_RUNBOOK.md
  rg -n "sk-|OPENROUTER_API_KEY=.*[^$]" docs/WORK_CLOUD_RUNBOOK.md README.md docs/QUICK_START.md || true
  git diff --check
  git add README.md docs/QUICK_START.md AGENTS.md docs/WORK_CLOUD_RUNBOOK.md
  git commit -m "docs: document Work Cloud headless workflow"
  ```

### Task 3: Add keyless Linux CI coverage

**Files:**
- Create: `.github/workflows/headless.yml`
- Create: `tests/fixtures/headless-input/.gitkeep`

- [ ] **Step 1: Add the Ubuntu workflow.**

  The workflow must trigger on pushes and pull requests, use `ubuntu-latest`, install Python 3.11, install `ffmpeg`, install `requirements-headless.txt` plus `pytest`, run the focused headless tests, run the cloud-profile doctor in `--dry-run` mode against `tests/fixtures/headless-input`, and run Python compilation. It must not require or create a real provider credential.

- [ ] **Step 2: Validate the workflow YAML and commit.**

  ```bash
  python3 - <<'PY'
  import pathlib
  import yaml
  yaml.safe_load(pathlib.Path('.github/workflows/headless.yml').read_text())
  print('workflow_yaml=PASS')
  PY
  git diff --check
  git add .github/workflows/headless.yml tests/fixtures/headless-input/.gitkeep
  git commit -m "ci: verify portable headless workflow"
  ```

### Task 4: Full verification, publish, and default-branch receipt

**Files:**
- Modify only files already listed above if verification finds a defect.

- [ ] **Step 1: Run the complete local verification suite.**

  ```bash
  npx pyright --project pyrightconfig.json
  cd desktop/backend && .venv/bin/python -m pytest -q && .venv/bin/python -m py_compile *.py ../../shared/transcribe_core.py
  cd ../../desktop && npm run build:all
  cd ..
  python3 -m pytest -q tests/test_headless_runner.py
  python3 scripts/mediscribe_doctor.py --profile cloud --dry-run --input tests/fixtures/headless-input --output .tmp/headless-doctor
  python3 scripts/mediscribe_headless.py --profile cloud --input tests/fixtures/headless-input --output .tmp/headless-run --dry-run --json-summary
  git diff --check
  ```

- [ ] **Step 2: Confirm no media, secrets, or local environment state is staged.**

  ```bash
  git status --short
  git diff --cached --name-only
  git grep -n -I -E 'sk-[A-Za-z0-9]|OPENROUTER_API_KEY=[^$`" ]+|/Users/|/home/' -- ':!docs/superpowers/specs/*' ':!docs/superpowers/plans/*' || true
  ```

- [ ] **Step 3: Verify the current remote default branch and publish forward-only.**

  ```bash
  git fetch origin master
  git merge-base --is-ancestor origin/master HEAD
  git push origin HEAD:refs/heads/master
  ```

  Before reporting completion, compare `git rev-parse HEAD` with `git ls-remote origin refs/heads/master`, confirm the remote head equals the published commit, and confirm the pushed tree contains only the intended code, docs, tests, and workflow paths. Do not force-push or add any media directories.

- [ ] **Step 4: Commit any final verification-only correction, re-run the affected checks, and publish the final exact SHA.**

  The final report must include the published SHA, the default branch name actually used (`master` unless the remote changes), the headless commands, the desktop verification result, and any workspace permission prerequisite that cannot be controlled from the repository.
