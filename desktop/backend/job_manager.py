"""
Job manager for MediScribe Desktop.

Implements DESIGN.md §10.2 requirements:
- Single FIFO queue, one running job at a time
- Job model: id, file_paths, options, output_folder, state, etc.
- Worker thread calling transcribe_files with progress_callback
- "Stop after current file" cancellation mechanism
- States: queued → running → completed|failed|cancelled
- Progress events via callback pushed to async queue for WebSocket
"""

from __future__ import annotations

import asyncio
import threading
import uuid
from dataclasses import asdict, dataclass, field, fields
from datetime import datetime, timezone
from pathlib import Path
from queue import Queue
from typing import Any, Optional

from config_manager import get_config_manager
from path_setup import add_shared_to_path

add_shared_to_path()
from transcribe_core import (
    ProgressEvent,
    TranscriptionOptions,
    resolve_transcription_options,
    transcribe_files,
)


TRANSCRIPTION_OPTION_FIELDS = {field_info.name for field_info in fields(TranscriptionOptions)}


def normalize_transcription_options(options: dict[str, Any]) -> dict[str, Any]:
    """Map known UI aliases and drop unsupported UI-only option keys."""
    normalized = dict(options)
    if "model_name" not in normalized and "model_id" in normalized:
        normalized["model_name"] = normalized["model_id"]
    return {
        key: value
        for key, value in normalized.items()
        if key in TRANSCRIPTION_OPTION_FIELDS
    }


def resolve_job_options(
    options: dict[str, Any],
    config: dict[str, Any] | None = None,
    environ: dict[str, str] | None = None,
) -> TranscriptionOptions:
    """Build safe core options using explicit local config/environment choices."""
    normalized = normalize_transcription_options(options)
    resolved_config = get_config_manager().get() if config is None else config
    return resolve_transcription_options(
        TranscriptionOptions(**normalized),
        config=resolved_config,
        environ=environ,
    )


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class Job:
    """
    Job model representing a transcription run.

    States: queued → running → completed | failed | cancelled
    """
    id: str
    file_paths: list[str]
    options: dict[str, Any]  # Serialized TranscriptionOptions
    output_folder: str
    normalize_audio: bool = False
    overwrite: bool = False
    dry_run: bool = False

    # State management
    state: str = "queued"  # queued | running | completed | failed | cancelled
    created_at: str = field(default_factory=utc_now_iso)
    started_at: Optional[str] = None
    finished_at: Optional[str] = None

    # Progress tracking
    current_file: str = ""
    progress: float = 0.0
    status_rows: list[dict[str, Any]] = field(default_factory=list)

    # Results
    error_message: str = ""
    last_progress_event: Optional[dict[str, Any]] = None

    # Cancellation flag
    cancel_requested: bool = False


class CancellationException(Exception):
    """Raised to signal graceful job cancellation."""
    pass


class JobManager:
    """
    Manages transcription jobs in a single FIFO queue.

    One running job at a time (one GPU; core is not reentrant-safe).
    Worker thread consumes the queue and calls transcribe_files.
    """

    def __init__(self):
        self._jobs: dict[str, Job] = {}
        self._job_queue: Queue[str] = Queue()
        self._current_job_id: Optional[str] = None
        self._lock = threading.RLock()

        # Worker thread
        self._worker_thread: Optional[threading.Thread] = None
        self._stop_flag = threading.Event()

        # Async queue for progress events (for WebSocket broadcasting)
        self._progress_queue: Optional[asyncio.Queue] = None
        self._event_loop: Optional[asyncio.AbstractEventLoop] = None

    def set_event_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Set the asyncio event loop for pushing progress events."""
        self._event_loop = loop
        self._progress_queue = asyncio.Queue()

    def start_worker(self) -> None:
        """Start the background worker thread."""
        if self._worker_thread is not None and self._worker_thread.is_alive():
            return

        self._stop_flag.clear()
        self._worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self._worker_thread.start()

    def stop_worker(self) -> None:
        """Stop the background worker thread gracefully."""
        self._stop_flag.set()
        if self._worker_thread is not None:
            self._worker_thread.join(timeout=5.0)

    def create_job(
        self,
        file_paths: list[str],
        options: dict[str, Any],
        output_folder: str,
        normalize_audio: bool = False,
        overwrite: bool = False,
        dry_run: bool = False,
    ) -> str:
        """
        Create a new job and add it to the queue.

        Returns:
            Job ID
        """
        job_id = str(uuid.uuid4())

        job = Job(
            id=job_id,
            file_paths=file_paths,
            options=options,
            output_folder=output_folder,
            normalize_audio=normalize_audio,
            overwrite=overwrite,
            dry_run=dry_run,
        )

        with self._lock:
            self._jobs[job_id] = job
            self._job_queue.put(job_id)

        self._push_event({
            "type": "job_created",
            "job_id": job_id,
            "timestamp": utc_now_iso(),
            "payload": self._serialize_job(job),
        })
        self._push_event({
            "type": "job_state",
            "job_id": job_id,
            "timestamp": utc_now_iso(),
            "payload": {
                "state": job.state,
                "cancel_requested": job.cancel_requested,
                "progress": job.progress,
                "job": self._serialize_job(job),
            },
        })
        return job_id

    def get_job(self, job_id: str) -> Optional[dict[str, Any]]:
        """Get job by ID, returns serialized job dict."""
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            return self._serialize_job(job)

    def get_all_jobs(self) -> list[dict[str, Any]]:
        """Get all jobs, returns list of serialized job dicts."""
        with self._lock:
            return [self._serialize_job(job) for job in self._jobs.values()]

    def cancel_job(self, job_id: str) -> bool:
        """
        Request cancellation of a job.

        Implements "stop after current file" mechanism.
        If job is running, sets cancel_requested flag.
        If job is queued, immediately marks as cancelled.

        Returns:
            True if cancellation was requested/applied, False if job not found or already finished
        """
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return False

            if job.state in ("completed", "failed", "cancelled"):
                return False

            if job.state == "queued":
                # Cancel immediately if not started
                job.state = "cancelled"
                job.finished_at = utc_now_iso()
                job.error_message = "Cancelled before processing"
                self._push_final_state(job)
                return True

            if job.state == "running":
                # Request cancellation after current file
                job.cancel_requested = True
                serialized = self._serialize_job(job)
                self._push_event({
                    "type": "job_stop_requested",
                    "job_id": job.id,
                    "timestamp": utc_now_iso(),
                    "payload": {
                        "state": job.state,
                        "cancel_requested": True,
                        "current_file": job.current_file,
                        "job": serialized,
                    },
                })
                self._push_event({
                    "type": "job_state",
                    "job_id": job.id,
                    "timestamp": utc_now_iso(),
                    "payload": {
                        "state": job.state,
                        "cancel_requested": True,
                        "current_file": job.current_file,
                        "progress": job.progress,
                        "job": serialized,
                    },
                })
                return True

        return False

    def _serialize_job(self, job: Job) -> dict[str, Any]:
        """Convert Job to dict for API responses."""
        return {
            "id": job.id,
            "file_paths": job.file_paths,
            "options": job.options,
            "output_folder": job.output_folder,
            "normalize_audio": job.normalize_audio,
            "overwrite": job.overwrite,
            "dry_run": job.dry_run,
            "state": job.state,
            "created_at": job.created_at,
            "started_at": job.started_at,
            "finished_at": job.finished_at,
            "current_file": job.current_file,
            "progress": job.progress,
            "status_rows": job.status_rows,
            "error_message": job.error_message,
            "last_progress_event": job.last_progress_event,
            "cancel_requested": job.cancel_requested,
        }

    def _worker_loop(self) -> None:
        """
        Main worker loop that processes jobs from the queue.

        Runs in a dedicated thread. Calls transcribe_files with progress_callback.
        """
        while not self._stop_flag.is_set():
            try:
                # Wait for a job (blocking, with timeout for checking stop flag)
                job_id = self._job_queue.get(timeout=1.0)
            except:
                continue

            # Process the job
            with self._lock:
                job = self._jobs.get(job_id)
                if job is None or job.state != "queued":
                    continue

                self._current_job_id = job_id
                job.state = "running"
                job.started_at = utc_now_iso()
                self._push_event({
                    "type": "job_state",
                    "job_id": job.id,
                    "timestamp": utc_now_iso(),
                    "payload": {
                        "state": job.state,
                        "started_at": job.started_at,
                        "cancel_requested": job.cancel_requested,
                        "total_files": len(job.file_paths),
                        "job": self._serialize_job(job),
                    },
                })

            # Run transcription
            try:
                self._run_job(job)
            except Exception as e:
                with self._lock:
                    job.state = "failed"
                    job.error_message = str(e)
                    job.finished_at = utc_now_iso()
                self._push_final_state(job)
            finally:
                with self._lock:
                    self._current_job_id = None

    def _run_job(self, job: Job) -> None:
        """
        Execute a single job by calling transcribe_files.

        Wraps the core's transcribe_files with a progress_callback that:
        1. Updates job state
        2. Pushes events to the async queue for WebSocket
        3. Checks cancellation flag at file boundaries
        """
        # Convert dict options back to TranscriptionOptions
        try:
            options = resolve_job_options(job.options)
            job.options = asdict(options)
        except Exception as e:
            job.state = "failed"
            job.error_message = f"Invalid options: {e}"
            job.finished_at = utc_now_iso()
            return

        # Convert string paths to Path objects
        file_paths = [Path(p) for p in job.file_paths]
        output_folder = Path(job.output_folder)

        # Create progress callback
        def progress_callback(event: ProgressEvent) -> None:
            """
            Progress callback that updates job state and pushes to async queue.

            Checks cancellation at file boundaries and raises CancellationException
            if requested.
            """
            # Update job with progress
            with self._lock:
                job.current_file = event.current_file
                job.progress = event.progress
                job.status_rows = event.status_rows

                # Serialize event for storage
                event_dict = {
                    "message": event.message,
                    "current_file": event.current_file,
                    "status_rows": event.status_rows,
                    "metrics": asdict(event.metrics),
                    "model_status": event.model_status,
                    "log_tail": event.log_tail,
                    "progress": event.progress,
                    "state": job.state,
                    "cancel_requested": job.cancel_requested,
                }
                job.last_progress_event = event_dict
                serialized = self._serialize_job(job)

            self._push_event({
                "type": "job_progress",
                "job_id": job.id,
                "timestamp": utc_now_iso(),
                "payload": {
                    **event_dict,
                    "job": serialized,
                },
            })

            # Check cancellation at file boundaries
            # File boundary is indicated by status messages starting with specific prefixes
            if job.cancel_requested:
                message_lower = event.message.lower()
                # Check if we're at a file boundary (between files)
                if any(prefix in message_lower for prefix in ["completed", "skipped", "failed"]):
                    # Raise exception to stop processing remaining files
                    raise CancellationException("Job cancelled by user request")

        # Run transcription
        try:
            transcribe_files(
                file_paths=file_paths,
                output_folder=output_folder,
                options=options,
                normalize_audio=job.normalize_audio,
                overwrite=job.overwrite,
                dry_run=job.dry_run,
                progress_callback=progress_callback,
            )

            # Job completed successfully
            with self._lock:
                if job.cancel_requested:
                    job.state = "cancelled"
                    job.error_message = "Cancelled after current file"
                else:
                    job.state = "completed"
                job.finished_at = utc_now_iso()

        except CancellationException:
            # Graceful cancellation
            with self._lock:
                job.state = "cancelled"
                job.error_message = "Cancelled by user after current file"
                job.finished_at = utc_now_iso()

        except Exception as e:
            # Unexpected error
            with self._lock:
                job.state = "failed"
                job.error_message = str(e)
                job.finished_at = utc_now_iso()

        self._push_final_state(job)

    def _push_final_state(self, job: Job) -> None:
        """Push a terminal job state event to WebSocket listeners."""
        if self._event_loop is not None and self._progress_queue is not None:
            try:
                serialized = self._serialize_job(job)
                self._event_loop.call_soon_threadsafe(
                    self._progress_queue.put_nowait,
                    {
                        "type": "job_state",
                        "job_id": job.id,
                        "timestamp": utc_now_iso(),
                        "payload": {
                            "state": job.state,
                            "error_message": job.error_message,
                            "finished_at": job.finished_at,
                            "cancel_requested": job.cancel_requested,
                            "progress": job.progress,
                            "job": serialized,
                        }
                    }
                )
            except Exception:
                pass

    def _push_event(self, event: dict[str, Any]) -> None:
        """Push an event to the async WebSocket queue if it is available."""
        if self._event_loop is None or self._progress_queue is None:
            return
        try:
            self._event_loop.call_soon_threadsafe(
                self._progress_queue.put_nowait,
                event,
            )
        except Exception:
            pass

    async def get_progress_event(self) -> Optional[dict[str, Any]]:
        """
        Get next progress event from async queue.

        Used by WebSocket handler to broadcast events to clients.
        Returns None if no event is available or queue not initialized.
        """
        if self._progress_queue is None:
            return None

        try:
            event = await asyncio.wait_for(self._progress_queue.get(), timeout=0.1)
            return event
        except asyncio.TimeoutError:
            return None


# Global singleton instance
_job_manager: Optional[JobManager] = None
_manager_lock = threading.Lock()


def get_job_manager() -> JobManager:
    """Get or create the global JobManager singleton."""
    global _job_manager

    with _manager_lock:
        if _job_manager is None:
            _job_manager = JobManager()

        return _job_manager


def start_job_manager(event_loop: asyncio.AbstractEventLoop) -> JobManager:
    """
    Initialize and start the job manager with an event loop.

    Should be called once at application startup.
    """
    manager = get_job_manager()
    manager.set_event_loop(event_loop)
    manager.start_worker()
    return manager


def stop_job_manager() -> None:
    """
    Stop the job manager gracefully.

    Should be called at application shutdown.
    """
    global _job_manager

    with _manager_lock:
        if _job_manager is not None:
            _job_manager.stop_worker()
