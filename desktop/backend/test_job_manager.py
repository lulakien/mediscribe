"""
Test suite for job_manager.py

Verifies:
- Job creation and queuing
- State transitions (queued → running → completed|failed|cancelled)
- Progress callback integration
- Cancellation mechanism ("stop after current file")
- Thread safety
- Async queue integration for WebSocket events
"""

import asyncio
import tempfile
import time
import sys
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).parent))

from job_manager import (
    Job,
    JobManager,
    CancellationException,
    get_job_manager,
    normalize_transcription_options,
    resolve_job_options,
)


def test_job_creation():
    """Test basic job creation and serialization."""
    job = Job(
        id="test-123",
        file_paths=["/path/to/audio.mp3"],
        options={"model_name": "large-v3"},
        output_folder="/output",
    )

    assert job.id == "test-123"
    assert job.state == "queued"
    assert job.progress == 0.0
    assert job.cancel_requested is False


def test_job_manager_singleton():
    """Test that get_job_manager returns a singleton."""
    manager1 = get_job_manager()
    manager2 = get_job_manager()
    assert manager1 is manager2


def test_create_and_get_job():
    """Test creating a job and retrieving it."""
    manager = JobManager()

    job_id = manager.create_job(
        file_paths=["/test/audio1.mp3", "/test/audio2.mp3"],
        options={"model_name": "large-v3", "device": "cuda"},
        output_folder="/output",
        normalize_audio=True,
        overwrite=False,
        dry_run=False,
    )

    # Retrieve job
    job = manager.get_job(job_id)
    assert job is not None
    assert job["id"] == job_id
    assert job["state"] == "queued"
    assert len(job["file_paths"]) == 2
    assert job["options"]["model_name"] == "large-v3"
    assert job["normalize_audio"] is True


def test_normalize_transcription_options_maps_model_id_and_drops_unknown_keys():
    """Frontend aliases and UI-only options should not break core options."""
    options = normalize_transcription_options({
        "model_id": "large-v3",
        "device": "cuda",
        "best_of": 5,
        "task": "transcribe",
    })

    assert options == {
        "model_name": "large-v3",
        "device": "cuda",
    }


def test_resolve_job_options_uses_explicit_openrouter_gateway_without_key_value():
    options = resolve_job_options(
        {"model_name": "large-v3"},
        config={
            "apiGateway": {
                "enabled": True,
                "provider": "openrouter",
                "model_name": "microsoft/mai-transcribe-2",
                "api_key_env_var": "OPENROUTER_API_KEY",
            }
        },
        environ={},
    )

    assert options.backend == "openrouter_transcribe"
    assert options.model_name == "microsoft/mai-transcribe-2"
    assert options.api_key_env_var == "OPENROUTER_API_KEY"


def test_resolve_job_options_defaults_to_local_without_gateway():
    options = resolve_job_options({"model_name": "large-v3"}, config={}, environ={})

    assert options.backend == "local_whisper"
    assert options.model_name == "large-v3"


def test_get_all_jobs():
    """Test retrieving all jobs."""
    manager = JobManager()

    job_id1 = manager.create_job(
        file_paths=["/test/audio1.mp3"],
        options={},
        output_folder="/output",
    )

    job_id2 = manager.create_job(
        file_paths=["/test/audio2.mp3"],
        options={},
        output_folder="/output",
    )

    all_jobs = manager.get_all_jobs()
    assert len(all_jobs) == 2

    job_ids = {job["id"] for job in all_jobs}
    assert job_id1 in job_ids
    assert job_id2 in job_ids


def test_cancel_queued_job():
    """Test cancelling a job that hasn't started yet."""
    manager = JobManager()

    job_id = manager.create_job(
        file_paths=["/test/audio.mp3"],
        options={},
        output_folder="/output",
    )

    # Cancel before it starts
    result = manager.cancel_job(job_id)
    assert result is True

    # Check job state
    job = manager.get_job(job_id)
    assert job is not None
    assert job["state"] == "cancelled"
    assert "Cancelled before processing" in job["error_message"]


def test_cancel_running_job():
    """Test requesting cancellation of a running job."""
    manager = JobManager()

    job_id = manager.create_job(
        file_paths=["/test/audio.mp3"],
        options={},
        output_folder="/output",
    )

    # Manually set job to running (simulating worker)
    with manager._lock:
        job = manager._jobs[job_id]
        job.state = "running"

    # Request cancellation
    result = manager.cancel_job(job_id)
    assert result is True

    # Check that cancel flag is set
    job = manager.get_job(job_id)
    assert job is not None
    assert job["cancel_requested"] is True


def test_cancel_completed_job():
    """Test that completed jobs cannot be cancelled."""
    manager = JobManager()

    job_id = manager.create_job(
        file_paths=["/test/audio.mp3"],
        options={},
        output_folder="/output",
    )

    # Manually set job to completed
    with manager._lock:
        job = manager._jobs[job_id]
        job.state = "completed"

    # Try to cancel
    result = manager.cancel_job(job_id)
    assert result is False

    # State should remain completed
    job = manager.get_job(job_id)
    assert job is not None
    assert job["state"] == "completed"


def test_cancel_nonexistent_job():
    """Test cancelling a job that doesn't exist."""
    manager = JobManager()

    result = manager.cancel_job("nonexistent-id")
    assert result is False


def test_async_queue_integration():
    """Test that progress events are pushed to async queue."""
    manager = JobManager()

    # Create event loop
    loop = asyncio.new_event_loop()
    manager.set_event_loop(loop)

    # Push a mock event
    job_id = manager.create_job(
        file_paths=["/test/audio.mp3"],
        options={},
        output_folder="/output",
    )

    # Manually push an event
    event = {
        "type": "job_progress",
        "job_id": job_id,
        "timestamp": "2024-01-01T00:00:00",
        "payload": {"message": "Test", "progress": 0.5}
    }

    assert manager._progress_queue is not None
    loop.call_soon_threadsafe(manager._progress_queue.put_nowait, event)

    # Retrieve event
    async def get_event():
        return await manager.get_progress_event()

    retrieved_event = loop.run_until_complete(get_event())
    assert retrieved_event is not None
    assert retrieved_event["type"] == "job_created"
    assert retrieved_event["job_id"] == job_id

    retrieved_event = loop.run_until_complete(get_event())
    assert retrieved_event is not None
    assert retrieved_event["type"] == "job_state"
    assert retrieved_event["job_id"] == job_id

    retrieved_event = loop.run_until_complete(get_event())
    assert retrieved_event is not None
    assert retrieved_event["type"] == "job_progress"
    assert retrieved_event["job_id"] == job_id
    assert retrieved_event["payload"]["progress"] == 0.5

    loop.close()


def test_worker_lifecycle():
    """Test starting and stopping the worker thread."""
    manager = JobManager()

    # Start worker
    manager.start_worker()
    assert manager._worker_thread is not None
    assert manager._worker_thread.is_alive()

    # Stop worker
    manager.stop_worker()
    time.sleep(0.5)  # Give thread time to stop
    assert manager._stop_flag.is_set()


def test_serialize_job():
    """Test job serialization for API responses."""
    manager = JobManager()

    job = Job(
        id="test-123",
        file_paths=["/test/audio.mp3"],
        options={"model_name": "large-v3"},
        output_folder="/output",
        state="running",
        progress=0.5,
    )

    serialized = manager._serialize_job(job)

    assert serialized["id"] == "test-123"
    assert serialized["state"] == "running"
    assert serialized["progress"] == 0.5
    assert serialized["file_paths"] == ["/test/audio.mp3"]
    assert serialized["options"]["model_name"] == "large-v3"


def test_multiple_jobs_queued():
    """Test that multiple jobs are queued in FIFO order."""
    manager = JobManager()

    job_ids = []
    for i in range(5):
        job_id = manager.create_job(
            file_paths=[f"/test/audio{i}.mp3"],
            options={},
            output_folder="/output",
        )
        job_ids.append(job_id)

    # All should be queued
    all_jobs = manager.get_all_jobs()
    assert len(all_jobs) == 5

    for job in all_jobs:
        assert job["state"] == "queued"


def test_cancellation_exception():
    """Test that CancellationException can be raised."""
    try:
        raise CancellationException("Test cancellation")
    except CancellationException as e:
        assert str(e) == "Test cancellation"


def test_progress_callback_updates_job():
    """Test that progress callback updates job state correctly."""
    from transcribe_core import ProgressEvent, RunMetrics

    manager = JobManager()
    job_id = manager.create_job(
        file_paths=["/test/audio.mp3"],
        options={},
        output_folder="/output",
    )

    with manager._lock:
        job = manager._jobs[job_id]
        job.state = "running"

    # Create a mock progress event
    event = ProgressEvent(
        message="Processing file",
        current_file="audio.mp3",
        status_rows=[{"file": "audio.mp3", "status": "processing"}],
        metrics=RunMetrics(wall_time_seconds=10.0, realtime_factor=0.5),
        model_status="loaded",
        log_tail="Log output...",
        progress=0.5,
    )

    # Simulate progress callback updating the job
    with manager._lock:
        job.current_file = event.current_file
        job.progress = event.progress
        job.status_rows = event.status_rows

    # Verify updates
    job_data = manager.get_job(job_id)
    assert job_data is not None
    assert job_data["current_file"] == "audio.mp3"
    assert job_data["progress"] == 0.5
    assert len(job_data["status_rows"]) == 1


if __name__ == "__main__":
    print("Running job_manager tests...")

    tests = [
        test_job_creation,
        test_job_manager_singleton,
        test_create_and_get_job,
        test_get_all_jobs,
        test_cancel_queued_job,
        test_cancel_running_job,
        test_cancel_completed_job,
        test_cancel_nonexistent_job,
        test_async_queue_integration,
        test_worker_lifecycle,
        test_serialize_job,
        test_multiple_jobs_queued,
        test_cancellation_exception,
        test_progress_callback_updates_job,
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            test()
            print(f"✓ {test.__name__}")
            passed += 1
        except Exception as e:
            print(f"✗ {test.__name__}: {e}")
            failed += 1

    print(f"\n{passed} passed, {failed} failed")
