"""
MediScribe Desktop Backend - FastAPI application.

Implements DESIGN.md §9.3, §10 requirements:
- REST + WebSocket API for Electron renderer
- Bearer token authentication
- Ephemeral port binding with READY signal
- Integration of config, file, model, and job managers
- Graceful shutdown
"""

import asyncio
import json
import os
import platform
import shutil
import subprocess
import sys
import traceback
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import (
    Depends,
    FastAPI,
    HTTPException,
    Request,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import uvicorn

from path_setup import add_shared_to_path

add_shared_to_path()

# Import managers
from config_manager import get_config_manager
from file_manager import (
    FileInspectRequest,
    FileInspectResponse,
    ensure_output_folder,
    inspect_files,
    validate_output_folder,
)
from job_manager import get_job_manager, start_job_manager, stop_job_manager
from model_manager import get_model_manager

try:
    from transcribe_core import TranscriptionOptions
except ImportError:
    # Fallback for type hints if core not available
    TranscriptionOptions = Dict[str, Any]


# --- Application Metadata ---
APP_VERSION = "0.1.0"
APP_NAME = "MediScribe Desktop Backend"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# --- Request/Response Models ---

class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    version: str
    timestamp: str
    cuda_available: bool = False
    cuda_device: Optional[str] = None
    ffmpeg_available: bool = False
    ffmpeg_path: Optional[str] = None
    ffprobe_available: bool = False
    ffprobe_path: Optional[str] = None
    ffmpeg_version: Optional[str] = None
    python_version: str = ""
    python_executable: str = ""
    platform: str = ""
    default_model: str = "large-v3"


class SettingsUpdateRequest(BaseModel):
    """Request to update settings (partial)."""
    updates: Dict[str, Any]


class JobCreateRequest(BaseModel):
    """Request to create a transcription job."""
    file_paths: List[str]
    options: Dict[str, Any]
    output_folder: str
    normalize_audio: bool = False
    overwrite: bool = False
    dry_run: bool = False


class JobCancelRequest(BaseModel):
    """Request to cancel a job."""
    job_id: str


class ModelDownloadRequest(BaseModel):
    """Request to download a model."""
    model_id: str


class TestRequest(BaseModel):
    """Request body for model test."""
    device: str = "cuda"
    compute_type: str = "float16"


class DeleteRequest(BaseModel):
    """Request body for model deletion."""
    confirm: bool = False


class OutputFolderRequest(BaseModel):
    """Request body for output folder validation/creation."""
    folder_path: str


# --- Authentication Middleware ---

EXPECTED_TOKEN = os.environ.get("MEDISCRIBE_TOKEN", "")


async def verify_token(request: Request) -> None:
    """
    Verify bearer token from Authorization header.

    Raises:
        HTTPException: If token is missing or invalid.
    """
    if not EXPECTED_TOKEN:
        # No token configured - allow (dev mode)
        return

    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
        )

    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Authorization header format",
        )

    token = parts[1]
    if token != EXPECTED_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )


# --- Lifespan Management ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.

    Startup: Initialize job manager with event loop.
    Shutdown: Stop job manager gracefully.
    """
    # Startup
    loop = asyncio.get_running_loop()
    start_job_manager(loop)

    yield

    # Shutdown
    stop_job_manager()


# --- FastAPI Application ---

app = FastAPI(
    title=APP_NAME,
    version=APP_VERSION,
    lifespan=lifespan,
)

# CORS for Electron renderer
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Electron renderer origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Health Endpoint ---

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint.

    Returns version, status, and timestamp.
    """
    config = get_config_manager().get()
    cuda_available, cuda_device = detect_cuda_status()
    ffmpeg_status = detect_ffmpeg_status()

    return HealthResponse(
        status="healthy",
        version=APP_VERSION,
        timestamp=utc_now_iso(),
        cuda_available=cuda_available,
        cuda_device=cuda_device,
        **ffmpeg_status,
        python_version=platform.python_version(),
        python_executable=sys.executable,
        platform=platform.platform(),
        default_model=config.get("defaultModel", "large-v3"),
    )


def detect_cuda_status() -> tuple[bool, Optional[str]]:
    """Return CUDA availability and a best-effort GPU name."""
    try:
        import ctranslate2

        if ctranslate2.get_cuda_device_count() <= 0:
            return False, None
    except Exception:
        return False, None

    try:
        completed = subprocess.run(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader", "-i", "0"],
            check=True,
            capture_output=True,
            text=True,
            timeout=3,
        )
        device_name = completed.stdout.strip().splitlines()[0].strip()
        return True, device_name or None
    except Exception:
        return True, None


def detect_ffmpeg_status() -> dict[str, Any]:
    """Return ffmpeg/ffprobe availability using the packaged process PATH."""
    ffmpeg_path = shutil.which("ffmpeg")
    ffprobe_path = shutil.which("ffprobe")
    version = None

    if ffmpeg_path:
        try:
            completed = subprocess.run(
                [ffmpeg_path, "-version"],
                check=True,
                capture_output=True,
                text=True,
                timeout=3,
            )
            version = completed.stdout.splitlines()[0].strip() or None
        except Exception:
            version = None

    return {
        "ffmpeg_available": ffmpeg_path is not None,
        "ffmpeg_path": ffmpeg_path,
        "ffprobe_available": ffprobe_path is not None,
        "ffprobe_path": ffprobe_path,
        "ffmpeg_version": version,
    }


# --- Settings Endpoints ---

@app.get("/settings", dependencies=[Depends(verify_token)])
async def get_settings():
    """
    Get current configuration.

    Returns:
        Config dictionary.
    """
    config_manager = get_config_manager()
    return config_manager.get()


@app.put("/settings", dependencies=[Depends(verify_token)])
async def update_settings(request: SettingsUpdateRequest):
    """
    Update configuration with partial updates.

    Args:
        request: Update request with fields to change.

    Returns:
        Updated config dictionary.
    """
    config_manager = get_config_manager()
    try:
        updated = config_manager.put(request.updates)
        return updated
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# --- File Endpoints ---

@app.post("/files/inspect", dependencies=[Depends(verify_token)])
async def inspect_audio_files(request: FileInspectRequest) -> FileInspectResponse:
    """
    Inspect audio files and return supported/unsupported with metadata.

    Args:
        request: File inspection request with file paths.

    Returns:
        Inspection response with supported/unsupported files.
    """
    try:
        return inspect_files(request.file_paths, request.ffprobe_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File inspection failed: {str(e)}")


@app.post("/files/validate-output-folder", dependencies=[Depends(verify_token)])
async def validate_output_folder_endpoint(request: OutputFolderRequest):
    """
    Validate output folder: check if exists and writable.

    Args:
        request: Output folder path.

    Returns:
        Validation result with valid/exists/writable flags.
    """
    return validate_output_folder(request.folder_path)


@app.post("/files/ensure-output-folder", dependencies=[Depends(verify_token)])
async def ensure_output_folder_endpoint(request: OutputFolderRequest):
    """
    Ensure output folder exists, creating if necessary.

    Args:
        request: Output folder path.

    Returns:
        Result with success/created flags.
    """
    result = ensure_output_folder(request.folder_path)
    if not result['success']:
        raise HTTPException(
            status_code=400,
            detail=result.get('error', 'Failed to create output folder')
        )
    return result


# --- Model Endpoints ---

@app.get("/models", dependencies=[Depends(verify_token)])
async def get_models():
    """
    Get all models with their current state.

    Returns:
        List of model state dictionaries.
    """
    model_manager = get_model_manager()
    return {"models": model_manager.get_all_models()}


@app.get("/models/{model_id}", dependencies=[Depends(verify_token)])
async def get_model(model_id: str):
    """
    Get state for a specific model.

    Args:
        model_id: Model ID.

    Returns:
        Model state dictionary.
    """
    model_manager = get_model_manager()
    model = model_manager.get_model(model_id)
    if model is None:
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found")
    return model


@app.post("/models/refresh", dependencies=[Depends(verify_token)])
async def refresh_models():
    """
    Refresh installed models by scanning cache.

    Returns:
        Updated list of models.
    """
    model_manager = get_model_manager()
    model_manager.refresh_installed_models()
    return {"models": model_manager.get_all_models()}


@app.post("/models/{model_id}/download", dependencies=[Depends(verify_token)])
async def download_model(model_id: str):
    """
    Start downloading a model.

    Args:
        model_id: Model ID to download.

    Returns:
        Status message.
    """
    model_manager = get_model_manager()

    # Progress callback pushes events to job manager's queue
    job_manager = get_job_manager()

    def progress_callback(event: Dict[str, Any]):
        if job_manager._event_loop and job_manager._progress_queue:
            try:
                job_manager._event_loop.call_soon_threadsafe(
                    job_manager._progress_queue.put_nowait,
                    {
                        "type": "model_download",
                        "model_id": model_id,
                        "timestamp": utc_now_iso(),
                        "payload": event,
                    }
                )
            except Exception:
                pass  # Queue full or loop closed

    success = model_manager.download_model(model_id, progress_callback)
    if not success:
        raise HTTPException(status_code=400, detail="Could not start download")

    return {"status": "downloading", "model_id": model_id}


@app.post("/models/{model_id}/cancel-download", dependencies=[Depends(verify_token)])
async def cancel_download(model_id: str):
    """
    Cancel an ongoing model download.

    Args:
        model_id: Model ID.

    Returns:
        Status message.
    """
    model_manager = get_model_manager()
    success = model_manager.cancel_download(model_id)
    if not success:
        raise HTTPException(status_code=400, detail="No download in progress")
    return {"status": "cancelled", "model_id": model_id}


@app.post("/models/{model_id}/test", dependencies=[Depends(verify_token)])
async def test_model(model_id: str, request: TestRequest):
    """
    Test load a model on specified device.

    Args:
        model_id: Model ID to test.
        request: Test parameters (device, compute_type).

    Returns:
        Test result with success, load time, VRAM, error.
    """
    model_manager = get_model_manager()

    # Run test in thread pool to avoid blocking
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        model_manager.test_model,
        model_id,
        request.device,
        request.compute_type
    )

    return result


@app.delete("/models/{model_id}", dependencies=[Depends(verify_token)])
async def delete_model(model_id: str, request: DeleteRequest):
    """
    Delete a model from cache.

    Args:
        model_id: Model ID to delete.
        request: Deletion confirmation.

    Returns:
        Deletion result with reclaimed bytes.
    """
    model_manager = get_model_manager()
    result = model_manager.delete_model(model_id, request.confirm)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Deletion failed"))
    return result


@app.get("/models/cache/info", dependencies=[Depends(verify_token)])
async def get_cache_info():
    """
    Get Hugging Face cache information.

    Returns:
        Cache info with path, size, and readable size.
    """
    model_manager = get_model_manager()
    cache_info = model_manager.get_cache_info()
    if cache_info is None:
        return {"error": "Could not read cache info"}
    return {
        "cache_path": cache_info.cache_path,
        "total_size_bytes": cache_info.total_size_bytes,
        "readable_size": cache_info.readable_size,
    }


# --- Job Endpoints ---

@app.post("/jobs", dependencies=[Depends(verify_token)])
async def create_job(request: JobCreateRequest):
    """
    Create a new transcription job.

    Args:
        request: Job creation request.

    Returns:
        Job ID and initial state.
    """
    job_manager = get_job_manager()

    job_id = job_manager.create_job(
        file_paths=request.file_paths,
        options=request.options,
        output_folder=request.output_folder,
        normalize_audio=request.normalize_audio,
        overwrite=request.overwrite,
        dry_run=request.dry_run,
    )

    return {
        "job_id": job_id,
        "status": "queued",
    }


@app.get("/jobs", dependencies=[Depends(verify_token)])
async def get_jobs():
    """
    Get all jobs.

    Returns:
        List of all jobs.
    """
    job_manager = get_job_manager()
    return {"jobs": job_manager.get_all_jobs()}


@app.get("/jobs/{job_id}", dependencies=[Depends(verify_token)])
async def get_job(job_id: str):
    """
    Get a specific job by ID.

    Args:
        job_id: Job ID.

    Returns:
        Job state dictionary.
    """
    job_manager = get_job_manager()
    job = job_manager.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return job


@app.get("/jobs/{job_id}/result", dependencies=[Depends(verify_token)])
async def get_job_result(job_id: str):
    """
    Return the first completed transcript for a job from its manifest output.

    The job manager is intentionally in-memory. Result files are the durable
    source of truth, so this endpoint bridges a live job id to the manifest row
    produced by transcribe_core.
    """
    job_manager = get_job_manager()
    job = job_manager.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    manifest_path = Path(job["output_folder"]).expanduser().resolve() / "manifests" / "manifest.json"
    if not manifest_path.exists():
        raise HTTPException(status_code=404, detail="Result manifest not found")

    try:
        rows = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail=f"Could not read result manifest: {exc}")

    source_paths = {str(Path(path).expanduser().resolve()) for path in job.get("file_paths", [])}
    row = next(
        (
            item
            for item in rows
            if isinstance(item, dict)
            and item.get("transcription_status") == "completed"
            and str(Path(str(item.get("source_path", ""))).expanduser().resolve()) in source_paths
        ),
        None,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Completed transcript not found for job")

    txt_path = Path(str(row.get("output_txt_path", ""))).expanduser().resolve()
    json_path = Path(str(row.get("output_json_path", ""))).expanduser().resolve()
    if not txt_path.exists() or not json_path.exists():
        raise HTTPException(status_code=404, detail="Transcript output files not found")

    try:
        transcript_json = json.loads(json_path.read_text(encoding="utf-8"))
        text = txt_path.read_text(encoding="utf-8")
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail=f"Could not read transcript output: {exc}")

    segments = []
    for index, segment in enumerate(transcript_json.get("segments", [])):
        if isinstance(segment, dict):
            segments.append(
                {
                    "id": index,
                    "start": segment.get("start", 0),
                    "end": segment.get("end", 0),
                    "text": segment.get("text", ""),
                }
            )

    return {
        "text": text,
        "segments": segments,
        "language": transcript_json.get("language", ""),
        "duration": transcript_json.get("duration_seconds") or 0,
    }


@app.post("/jobs/{job_id}/cancel", dependencies=[Depends(verify_token)])
async def cancel_job(job_id: str):
    """
    Cancel a job (stop after current file).

    Args:
        job_id: Job ID to cancel.

    Returns:
        Cancellation status.
    """
    job_manager = get_job_manager()
    success = job_manager.cancel_job(job_id)
    if not success:
        raise HTTPException(
            status_code=400,
            detail="Job not found or already finished"
        )
    return {"status": "cancellation_requested", "job_id": job_id}


# --- Results Endpoints ---

@app.get("/results", dependencies=[Depends(verify_token)])
async def get_results(output_folder: Optional[str] = None):
    """
    Get results from manifests.

    Args:
        output_folder: Optional output folder to filter by.

    Returns:
        Results from manifest(s).
    """
    folders = _result_roots(output_folder)
    results: List[Dict[str, Any]] = []
    errors: List[Dict[str, str]] = []

    for folder in folders:
      manifest_path = folder / "manifests" / "manifest.json"
      if not manifest_path.exists():
          continue

      try:
          rows = json.loads(manifest_path.read_text(encoding="utf-8"))
          if not isinstance(rows, list):
              raise ValueError("manifest.json must contain a list")
      except (OSError, json.JSONDecodeError, ValueError) as exc:
          errors.append({"folder": str(folder), "error": str(exc)})
          continue

      for row in rows:
          if isinstance(row, dict):
              enriched = dict(row)
              enriched["output_folder"] = str(folder)
              enriched["manifest_path"] = str(manifest_path)
              results.append(enriched)

    results.sort(
        key=lambda row: row.get("processing_finished_at") or row.get("processing_started_at") or "",
        reverse=True,
    )
    return {"results": results, "errors": errors}


@app.get("/results/preview", dependencies=[Depends(verify_token)])
async def get_result_preview(path: str):
    """
    Get preview of a result file (TXT, MD, or JSON).

    Args:
        path: File path to preview.

    Returns:
        File content (size-capped, path-validated).
    """
    requested_path = Path(path).expanduser().resolve()
    allowed_suffixes = {".txt", ".md", ".json"}
    if requested_path.suffix.lower() not in allowed_suffixes:
        raise HTTPException(status_code=400, detail="Preview supports TXT, MD, and JSON files only")

    if not requested_path.exists() or not requested_path.is_file():
        raise HTTPException(status_code=404, detail="Result file not found")

    roots = _result_roots(None)
    if roots and not _is_under_any_root(requested_path, roots):
        raise HTTPException(status_code=403, detail="Result file is outside known output folders")

    max_bytes = 1024 * 1024
    try:
        with requested_path.open("rb") as handle:
            raw = handle.read(max_bytes + 1)
    except OSError as exc:
        raise HTTPException(status_code=400, detail=f"Could not read file: {exc}")

    truncated = len(raw) > max_bytes
    content = raw[:max_bytes].decode("utf-8", errors="replace")
    return {
        "path": str(requested_path),
        "content": content,
        "truncated": truncated,
        "size_bytes": requested_path.stat().st_size,
    }


@app.get("/logs", dependencies=[Depends(verify_token)])
async def get_logs(output_folder: Optional[str] = None):
    """List real run logs under configured output folder logs directories."""
    roots = _result_roots(output_folder)
    logs: List[Dict[str, Any]] = []

    for root in roots:
        logs_dir = root / "logs"
        if not logs_dir.exists() or not logs_dir.is_dir():
            continue

        for log_path in logs_dir.glob("*.log"):
            if not log_path.is_file():
                continue

            try:
                stat = log_path.stat()
            except OSError:
                continue

            logs.append({
                "id": str(log_path),
                "name": log_path.name,
                "path": str(log_path),
                "date": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
                "size_bytes": stat.st_size,
                "output_folder": str(root),
            })

    logs.sort(key=lambda row: row.get("date", ""), reverse=True)
    return {"logs": logs}


@app.get("/logs/preview", dependencies=[Depends(verify_token)])
async def get_log_preview(path: str, output_folder: Optional[str] = None):
    """Read a size-capped log file from known output folder logs directories."""
    requested_path = Path(path).expanduser().resolve()
    if requested_path.suffix.lower() != ".log":
        raise HTTPException(status_code=400, detail="Log preview supports .log files only")

    roots = [root / "logs" for root in _result_roots(output_folder)]
    if roots and not _is_under_any_root(requested_path, roots):
        raise HTTPException(status_code=403, detail="Log file is outside known output folders")

    if not requested_path.exists() or not requested_path.is_file():
        raise HTTPException(status_code=404, detail="Log file not found")

    max_bytes = 1024 * 1024
    try:
        with requested_path.open("rb") as handle:
            raw = handle.read(max_bytes + 1)
    except OSError as exc:
        raise HTTPException(status_code=400, detail=f"Could not read log file: {exc}")

    truncated = len(raw) > max_bytes
    return {
        "path": str(requested_path),
        "content": raw[:max_bytes].decode("utf-8", errors="replace"),
        "truncated": truncated,
        "size_bytes": requested_path.stat().st_size,
    }


def _result_roots(output_folder: Optional[str]) -> List[Path]:
    """Return explicit or configured output folders for manifest-backed results."""
    if output_folder:
        return [Path(output_folder).expanduser().resolve()]

    config = get_config_manager().get()
    roots: List[Path] = []
    for key in ("defaultOutputFolder",):
        folder = config.get(key)
        if folder:
            roots.append(Path(folder).expanduser().resolve())

    for folder in config.get("recentOutputFolders", []):
        if folder:
            roots.append(Path(folder).expanduser().resolve())

    deduped: List[Path] = []
    seen = set()
    for root in roots:
        root_str = str(root)
        if root_str not in seen:
            seen.add(root_str)
            deduped.append(root)
    return deduped


def _is_under_any_root(path: Path, roots: List[Path]) -> bool:
    for root in roots:
        try:
            path.relative_to(root)
            return True
        except ValueError:
            continue
    return False


# --- WebSocket Events Endpoint ---

@app.websocket("/ws/events")
async def websocket_events(websocket: WebSocket):
    """
    WebSocket endpoint for progress and status events.

    Broadcasts:
    - job_progress: Transcription progress updates
    - job_state: Job state changes
    - model_download: Model download progress
    - backend_status: Backend status changes
    """
    # Accept connection (no auth on WebSocket in v1 - same-origin only)
    await websocket.accept()

    job_manager = get_job_manager()

    try:
        # Send initial connection confirmation
        await websocket.send_json({
            "type": "connected",
            "timestamp": utc_now_iso(),
            "payload": {"version": APP_VERSION}
        })

        # Event broadcasting loop
        while True:
            # Get next event from job manager's queue
            event = await job_manager.get_progress_event()

            if event is not None:
                await websocket.send_json(event)
            else:
                # No event available, small sleep to avoid tight loop
                await asyncio.sleep(0.1)

            # Check for client messages (ping/pong, etc.)
            try:
                # Non-blocking receive with timeout
                message = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=0.01
                )
                # Echo ping/pong for keepalive
                if message == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                pass  # No message, continue

    except WebSocketDisconnect:
        pass  # Client disconnected, cleanup
    except Exception as e:
        print(f"WebSocket error: {e}")
        traceback.print_exc()


# --- Shutdown Endpoint ---

@app.post("/shutdown", dependencies=[Depends(verify_token)])
async def shutdown():
    """
    Graceful shutdown endpoint.

    Stops job processing and signals the server to exit.
    """
    # Stop job manager
    stop_job_manager()

    # Signal uvicorn to shutdown
    # This is handled by the main() function catching the shutdown signal
    return {"status": "shutting_down"}


# --- Error Handlers ---

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Global exception handler for unhandled errors.
    """
    print(f"Unhandled exception: {exc}")
    traceback.print_exc()

    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "error": str(exc),
        },
    )


# --- Main Entry Point ---

def main():
    """
    Main entry point for the backend server.

    Binds to 127.0.0.1:0 (ephemeral port) and prints READY signal.
    """
    # Get port from environment or use 0 (ephemeral)
    port = int(os.environ.get("MEDISCRIBE_PORT", "0"))
    host = "127.0.0.1"

    # Configure uvicorn
    config = uvicorn.Config(
        app,
        host=host,
        port=port,
        log_level="info",
        access_log=False,  # Reduce noise
    )

    server = uvicorn.Server(config)

    # Custom startup to print READY signal
    original_startup = server.startup

    async def startup_with_ready(*args, **kwargs):
        await original_startup(*args, **kwargs)
        # Print READY with actual port for main process to parse
        actual_port = server.servers[0].sockets[0].getsockname()[1]
        print(f"READY port={actual_port}", flush=True)

    server.startup = startup_with_ready

    # Run server
    try:
        server.run()
    except KeyboardInterrupt:
        print("Shutdown requested")
    finally:
        # Cleanup
        stop_job_manager()


if __name__ == "__main__":
    main()
