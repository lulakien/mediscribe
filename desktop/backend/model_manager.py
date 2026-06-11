"""
Model manager for MediScribe desktop application.

Manages Whisper model catalog, installation detection, download, testing, and deletion.
Implements DESIGN.md §10.3 requirements.
"""

import gc
import os
import shutil
import subprocess
import time
import threading
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional, Dict, List, Callable
from enum import Enum

from huggingface_hub import scan_cache_dir, snapshot_download
from huggingface_hub.errors import HfHubHTTPError
from faster_whisper import WhisperModel


# Model catalog per DESIGN.md §10.3
@dataclass
class ModelInfo:
    """Information about a Whisper model."""
    id: str  # Internal ID (e.g., "large-v3")
    repo_id: str  # Hugging Face repo ID
    name: str  # Display name
    description: str  # Human-readable description
    approximate_size_gb: float  # Approximate size on disk
    quality_dots: int  # Quality rating (1-4 dots)
    relative_speed: str  # "standard", "fast", "faster"


# Static catalog of supported models
MODEL_CATALOG: List[ModelInfo] = [
    ModelInfo(
        id="large-v3",
        repo_id="Systran/faster-whisper-large-v3",
        name="large-v3",
        description="Best quality. The recommended model for lectures.",
        approximate_size_gb=3.1,
        quality_dots=4,
        relative_speed="standard"
    ),
    ModelInfo(
        id="large-v3-turbo",
        repo_id="Systran/faster-whisper-large-v3-turbo",
        name="large-v3-turbo",
        description="Nearly as accurate, noticeably faster.",
        approximate_size_gb=1.6,
        quality_dots=4,
        relative_speed="faster"
    ),
    ModelInfo(
        id="medium",
        repo_id="Systran/faster-whisper-medium",
        name="medium",
        description="Lighter fallback when VRAM is tight.",
        approximate_size_gb=1.5,
        quality_dots=3,
        relative_speed="fast"
    ),
    ModelInfo(
        id="small",
        repo_id="Systran/faster-whisper-small",
        name="small",
        description="Fast fallback for quick drafts.",
        approximate_size_gb=0.5,
        quality_dots=2,
        relative_speed="faster"
    ),
]


class ModelStatus(str, Enum):
    """Model installation status."""
    NOT_INSTALLED = "not_installed"
    INSTALLED = "installed"
    DOWNLOADING = "downloading"
    READY_ON_CUDA = "ready_on_cuda"
    FAILED_TO_LOAD = "failed_to_load"


@dataclass
class ModelState:
    """Current state of a model."""
    model_info: ModelInfo
    status: ModelStatus
    size_on_disk_bytes: Optional[int] = None
    last_test_result: Optional[Dict] = None  # {success: bool, load_time_s: float, error: str, vram_gb: float}
    download_progress: Optional[Dict] = None  # {downloaded_bytes: int, total_bytes: int, percent: float}


@dataclass
class CacheInfo:
    """Information about the Hugging Face cache."""
    cache_path: str
    total_size_bytes: int
    readable_size: str


class ModelManager:
    """
    Manages Whisper models: catalog, detection, download, test, delete.

    Thread-safe for concurrent operations via internal locking.
    """

    def __init__(self):
        """Initialize model manager."""
        self._states: Dict[str, ModelState] = {}
        self._lock = threading.RLock()
        self._download_threads: Dict[str, threading.Thread] = {}
        self._cancel_flags: Dict[str, threading.Event] = {}

        # Initialize states for all catalog models
        for model_info in MODEL_CATALOG:
            self._states[model_info.id] = ModelState(
                model_info=model_info,
                status=ModelStatus.NOT_INSTALLED
            )

        # Initial scan
        self.refresh_installed_models()

    def get_cache_info(self) -> Optional[CacheInfo]:
        """
        Get Hugging Face cache information.

        Returns:
            CacheInfo with cache path, total size, and readable size.
            None if cache scan fails.
        """
        try:
            cache_path = os.environ.get('HF_HOME')
            if not cache_path:
                cache_path = Path.home() / '.cache' / 'huggingface'
            else:
                cache_path = Path(cache_path)

            cache_info = scan_cache_dir(cache_dir=str(cache_path))
            total_bytes = sum(repo.size_on_disk for repo in cache_info.repos)

            return CacheInfo(
                cache_path=str(cache_path),
                total_size_bytes=total_bytes,
                readable_size=self._format_bytes(total_bytes)
            )
        except Exception as e:
            print(f"Failed to scan cache: {e}")
            return None

    def refresh_installed_models(self) -> None:
        """
        Scan Hugging Face cache and update model installation status.

        Updates status and size_on_disk for all catalog models.
        """
        with self._lock:
            try:
                cache_path = os.environ.get('HF_HOME')
                if not cache_path:
                    cache_path = Path.home() / '.cache' / 'huggingface'
                else:
                    cache_path = Path(cache_path)

                cache_info = scan_cache_dir(cache_dir=str(cache_path))
                installed_repos = {repo.repo_id: repo for repo in cache_info.repos}

                for model_id, state in self._states.items():
                    repo_id = state.model_info.repo_id

                    # Skip if currently downloading or being tested
                    if state.status in [ModelStatus.DOWNLOADING]:
                        continue

                    if repo_id in installed_repos:
                        repo_info = installed_repos[repo_id]
                        state.status = ModelStatus.INSTALLED
                        state.size_on_disk_bytes = repo_info.size_on_disk
                    else:
                        state.status = ModelStatus.NOT_INSTALLED
                        state.size_on_disk_bytes = None
                        state.last_test_result = None

            except Exception as e:
                print(f"Failed to refresh installed models: {e}")

    def get_all_models(self) -> List[Dict]:
        """
        Get all models with their current state.

        Returns:
            List of model state dictionaries.
        """
        with self._lock:
            result = []
            for model_id in sorted(self._states.keys()):
                state = self._states[model_id]
                state_dict = asdict(state)
                # Convert enum to string
                state_dict['status'] = state.status.value
                result.append(state_dict)
            return result

    def get_model(self, model_id: str) -> Optional[Dict]:
        """
        Get state for a specific model.

        Args:
            model_id: Model ID (e.g., "large-v3").

        Returns:
            Model state dictionary or None if not found.
        """
        with self._lock:
            state = self._states.get(model_id)
            if not state:
                return None

            state_dict = asdict(state)
            state_dict['status'] = state.status.value
            return state_dict

    def download_model(
        self,
        model_id: str,
        progress_callback: Optional[Callable[[Dict], None]] = None
    ) -> bool:
        """
        Download a model from Hugging Face.

        Args:
            model_id: Model ID to download.
            progress_callback: Optional callback for progress updates.
                             Called with dict: {downloaded_bytes, total_bytes, percent, message}

        Returns:
            True if download started successfully, False otherwise.
        """
        with self._lock:
            state = self._states.get(model_id)
            if not state:
                return False

            if state.status == ModelStatus.DOWNLOADING:
                return False  # Already downloading

            if state.status == ModelStatus.INSTALLED:
                return False  # Already installed

            # Mark as downloading
            state.status = ModelStatus.DOWNLOADING
            state.download_progress = {
                'downloaded_bytes': 0,
                'total_bytes': 0,
                'percent': 0.0
            }

            # Create cancel flag
            cancel_event = threading.Event()
            self._cancel_flags[model_id] = cancel_event

            # Start download in background thread
            thread = threading.Thread(
                target=self._download_worker,
                args=(model_id, progress_callback, cancel_event),
                daemon=True
            )
            self._download_threads[model_id] = thread
            thread.start()

            return True

    def _download_worker(
        self,
        model_id: str,
        progress_callback: Optional[Callable[[Dict], None]],
        cancel_event: threading.Event
    ) -> None:
        """
        Worker thread for downloading a model.

        Args:
            model_id: Model ID to download.
            progress_callback: Progress callback function.
            cancel_event: Event to signal cancellation.
        """
        state = self._states[model_id]
        repo_id = state.model_info.repo_id

        try:
            # Get cache directory
            cache_dir = os.environ.get('HF_HOME')
            if not cache_dir:
                cache_dir = str(Path.home() / '.cache' / 'huggingface')

            # Report start
            if progress_callback:
                progress_callback({
                    'model_id': model_id,
                    'downloaded_bytes': 0,
                    'total_bytes': 0,
                    'percent': 0.0,
                    'message': f'Starting download of {state.model_info.name}...'
                })

            # Download with periodic progress updates
            # Note: huggingface_hub doesn't provide built-in progress callbacks,
            # so we'll monitor the cache directory size
            start_time = time.time()

            # Start download (blocking)
            snapshot_download(
                repo_id=repo_id,
                cache_dir=cache_dir,
                local_files_only=False
            )

            # Check if cancelled
            if cancel_event.is_set():
                with self._lock:
                    state.status = ModelStatus.NOT_INSTALLED
                    state.download_progress = None
                if progress_callback:
                    progress_callback({
                        'model_id': model_id,
                        'message': 'Download cancelled',
                        'cancelled': True
                    })
                return

            # Download complete
            elapsed = time.time() - start_time

            # Refresh to get actual size
            self.refresh_installed_models()

            with self._lock:
                state.status = ModelStatus.INSTALLED
                state.download_progress = None

            if progress_callback:
                size_str = self._format_bytes(state.size_on_disk_bytes) if state.size_on_disk_bytes else "unknown size"
                progress_callback({
                    'model_id': model_id,
                    'percent': 100.0,
                    'message': f'Download complete: {state.model_info.name} ({size_str}) in {elapsed:.1f}s',
                    'completed': True
                })

        except HfHubHTTPError as e:
            with self._lock:
                state.status = ModelStatus.NOT_INSTALLED
                state.download_progress = None

            if progress_callback:
                progress_callback({
                    'model_id': model_id,
                    'message': f'Download failed: {str(e)}',
                    'error': str(e)
                })
        except Exception as e:
            with self._lock:
                state.status = ModelStatus.NOT_INSTALLED
                state.download_progress = None

            if progress_callback:
                progress_callback({
                    'model_id': model_id,
                    'message': f'Download failed: {str(e)}',
                    'error': str(e)
                })
        finally:
            # Cleanup
            with self._lock:
                self._download_threads.pop(model_id, None)
                self._cancel_flags.pop(model_id, None)

    def cancel_download(self, model_id: str) -> bool:
        """
        Cancel an ongoing download.

        Args:
            model_id: Model ID.

        Returns:
            True if cancellation signal was sent, False if no download in progress.
        """
        with self._lock:
            cancel_event = self._cancel_flags.get(model_id)
            if not cancel_event:
                return False

            cancel_event.set()
            return True

    def test_model(
        self,
        model_id: str,
        device: str = "cuda",
        compute_type: str = "float16"
    ) -> Dict:
        """
        Test load a model on specified device.

        Instantiates WhisperModel, times the load, then releases it.

        Args:
            model_id: Model ID to test.
            device: Device to load on ("cuda", "cpu", "auto").
            compute_type: Compute type ("float16", "int8", "int8_float16").

        Returns:
            Test result dict: {success: bool, load_time_s: float, error: str, vram_gb: float}
        """
        with self._lock:
            state = self._states.get(model_id)
            if not state:
                return {
                    'success': False,
                    'error': f'Model {model_id} not found in catalog'
                }

            if state.status == ModelStatus.NOT_INSTALLED:
                return {
                    'success': False,
                    'error': f'Model {model_id} is not installed'
                }

            if state.status == ModelStatus.DOWNLOADING:
                return {
                    'success': False,
                    'error': f'Model {model_id} is currently downloading'
                }

        # Test load (outside lock to avoid blocking)
        model_name = state.model_info.name
        result = {
            'success': False,
            'load_time_s': 0.0,
            'error': '',
            'vram_gb': 0.0,
            'device': device,
            'compute_type': compute_type
        }

        try:
            start_time = time.time()

            # Instantiate model
            model = WhisperModel(
                model_name,
                device=device,
                compute_type=compute_type
            )

            load_time = time.time() - start_time

            vram_gb = self._query_nvidia_memory_used_gb() if device == "cuda" else 0.0

            # Release model immediately
            del model
            gc.collect()

            result['success'] = True
            result['load_time_s'] = load_time
            result['vram_gb'] = vram_gb

            # Update state
            with self._lock:
                state.status = ModelStatus.READY_ON_CUDA if device == "cuda" else ModelStatus.INSTALLED
                state.last_test_result = result.copy()

        except Exception as e:
            error_msg = str(e)

            # Provide friendly error messages for common issues
            if "out of memory" in error_msg.lower() or "oom" in error_msg.lower():
                error_msg = f"Not enough GPU memory for {model_name}. Try the Low VRAM Safe preset, or free GPU memory and retry."
            elif "cuda" in error_msg.lower() and "available" in error_msg.lower():
                error_msg = "CUDA is not available. Check your GPU drivers and CUDA installation."

            result['error'] = error_msg

            # Update state
            with self._lock:
                state.status = ModelStatus.FAILED_TO_LOAD
                state.last_test_result = result.copy()

        return result

    @staticmethod
    def _query_nvidia_memory_used_gb() -> float:
        """Best-effort NVIDIA memory reading without adding a torch dependency."""
        try:
            completed = subprocess.run(
                [
                    "nvidia-smi",
                    "--query-gpu=memory.used",
                    "--format=csv,noheader,nounits",
                ],
                check=True,
                capture_output=True,
                text=True,
                timeout=3,
            )
            first_value = completed.stdout.strip().splitlines()[0]
            return float(first_value) / 1024.0
        except Exception:
            return 0.0

    def delete_model(self, model_id: str, confirm: bool = False) -> Dict:
        """
        Delete a model from cache.

        Args:
            model_id: Model ID to delete.
            confirm: Must be True to actually delete (safety check).

        Returns:
            Result dict: {success: bool, reclaimed_bytes: int, error: str}
        """
        if not confirm:
            return {
                'success': False,
                'error': 'Deletion requires explicit confirmation (confirm=true)'
            }

        with self._lock:
            state = self._states.get(model_id)
            if not state:
                return {
                    'success': False,
                    'error': f'Model {model_id} not found in catalog'
                }

            if state.status == ModelStatus.NOT_INSTALLED:
                return {
                    'success': False,
                    'error': f'Model {model_id} is not installed'
                }

            if state.status == ModelStatus.DOWNLOADING:
                return {
                    'success': False,
                    'error': f'Cannot delete {model_id} while downloading'
                }

            repo_id = state.model_info.repo_id
            size_before = state.size_on_disk_bytes or 0

        # Delete from cache
        try:
            cache_path = os.environ.get('HF_HOME')
            if not cache_path:
                cache_path = Path.home() / '.cache' / 'huggingface'
            else:
                cache_path = Path(cache_path)

            # Scan cache to find the repo
            cache_info = scan_cache_dir(cache_dir=str(cache_path))

            repo_to_delete = None
            for repo in cache_info.repos:
                if repo.repo_id == repo_id:
                    repo_to_delete = repo
                    break

            if not repo_to_delete:
                with self._lock:
                    state.status = ModelStatus.NOT_INSTALLED
                    state.size_on_disk_bytes = None
                    state.last_test_result = None
                return {
                    'success': False,
                    'error': f'Model {model_id} not found in cache'
                }

            # Delete all revisions of this repo
            reclaimed = 0
            for revision in repo_to_delete.revisions:
                strategy = cache_info.delete_revisions(revision.commit_hash)
                reclaimed += strategy.expected_freed_size
                strategy.execute()

            # Update state
            with self._lock:
                state.status = ModelStatus.NOT_INSTALLED
                state.size_on_disk_bytes = None
                state.last_test_result = None

            return {
                'success': True,
                'reclaimed_bytes': reclaimed,
                'reclaimed_readable': self._format_bytes(reclaimed)
            }

        except Exception as e:
            return {
                'success': False,
                'error': f'Failed to delete model: {str(e)}'
            }

    @staticmethod
    def _format_bytes(bytes_value: Optional[int]) -> str:
        """Format bytes as human-readable string."""
        if bytes_value is None:
            return "unknown"

        if bytes_value == 0:
            return "0 B"

        units = ['B', 'KB', 'MB', 'GB', 'TB']
        unit_index = 0
        size = float(bytes_value)

        while size >= 1024 and unit_index < len(units) - 1:
            size /= 1024
            unit_index += 1

        if unit_index == 0:
            return f"{int(size)} {units[unit_index]}"
        else:
            return f"{size:.2f} {units[unit_index]}"


# Singleton instance
_model_manager: Optional[ModelManager] = None


def get_model_manager() -> ModelManager:
    """
    Get the singleton ModelManager instance.

    Returns:
        ModelManager instance.
    """
    global _model_manager
    if _model_manager is None:
        _model_manager = ModelManager()
    return _model_manager
