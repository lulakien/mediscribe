"""File manager for audio file inspection and validation.

Implements DESIGN.md §10.7: validates file selection, probes metadata,
and returns supported/unsupported files with reasons.
"""

from pathlib import Path
from typing import Any, Optional

from pydantic import BaseModel
from path_setup import add_shared_to_path

add_shared_to_path()
from transcribe_core import (
    AUDIO_EXTENSIONS,
    AudioMetadata,
    UnsupportedFile,
    collect_audio_files_from_selection,
    probe_audio,
)


# --- Request/Response Models ---

class FileInspectRequest(BaseModel):
    """Request body for file inspection."""
    file_paths: list[str]
    ffprobe_path: Optional[str] = None


class FileMetadata(BaseModel):
    """Metadata for a single audio file."""
    source_path: str
    original_filename: str
    duration_seconds: Optional[float] = None
    duration_hms: Optional[str] = None
    codec: Optional[str] = None
    sample_rate: Optional[str] = None
    channels: Optional[int] = None
    bitrate: Optional[str] = None
    file_size_mb: Optional[float] = None
    modified_time: Optional[str] = None
    warnings: list[str]


class UnsupportedFileInfo(BaseModel):
    """Information about an unsupported file."""
    source_path: str
    original_filename: Optional[str] = None
    reason: str


class FileInspectResponse(BaseModel):
    """Response for file inspection."""
    supported: list[FileMetadata]
    unsupported: list[UnsupportedFileInfo]
    total_duration_seconds: float
    total_size_mb: float


# --- Path Validation Utilities ---

def validate_path(path_str: str) -> Optional[Path]:
    """
    Validate and resolve a file path.

    Args:
        path_str: Path string to validate

    Returns:
        Resolved Path object if valid, None otherwise
    """
    try:
        path = Path(path_str).expanduser().resolve()

        # Basic security check: path must exist and be a file
        if not path.exists():
            return None
        if not path.is_file():
            return None

        return path
    except (ValueError, OSError, RuntimeError):
        return None


def is_audio_extension(path: Path) -> bool:
    """
    Check if a file has a supported audio extension.

    Args:
        path: Path to check

    Returns:
        True if extension is supported, False otherwise
    """
    return path.suffix.lower() in AUDIO_EXTENSIONS


def seconds_to_hms(seconds: Optional[float]) -> Optional[str]:
    """
    Convert seconds to HH:MM:SS format.

    Args:
        seconds: Duration in seconds

    Returns:
        Formatted string or None if input is None
    """
    if seconds is None:
        return None

    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)

    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    else:
        return f"{minutes:02d}:{secs:02d}"


# --- Main Inspection Function ---

def inspect_files(
    file_paths: list[str],
    ffprobe_path: Optional[str] = None
) -> FileInspectResponse:
    """
    Inspect audio files and return supported/unsupported with metadata.

    Implements DESIGN.md §10.7 requirement: validates selection, probes metadata,
    returns supported/unsupported with reasons using core functions.

    Args:
        file_paths: List of absolute file paths to inspect
        ffprobe_path: Optional path to ffprobe binary

    Returns:
        FileInspectResponse with supported/unsupported files and metadata
    """
    # Use collect_audio_files_from_selection from core
    # Convert string paths to the format expected by the core function
    valid_files, unsupported_files, _ = collect_audio_files_from_selection(file_paths)

    supported: list[FileMetadata] = []
    total_duration = 0.0
    total_size = 0.0

    # Probe metadata for each valid file
    for file_path in valid_files:
        metadata: AudioMetadata = probe_audio(file_path, ffprobe_path)

        # Convert AudioMetadata to FileMetadata
        file_metadata = FileMetadata(
            source_path=str(file_path),
            original_filename=file_path.name,
            duration_seconds=metadata.duration_seconds,
            duration_hms=seconds_to_hms(metadata.duration_seconds),
            codec=metadata.codec,
            sample_rate=metadata.sample_rate,
            channels=metadata.channels,
            bitrate=metadata.bitrate,
            file_size_mb=metadata.file_size_mb,
            modified_time=metadata.modified_time,
            warnings=metadata.warnings
        )

        supported.append(file_metadata)

        # Accumulate totals
        if metadata.duration_seconds is not None:
            total_duration += metadata.duration_seconds
        if metadata.file_size_mb is not None:
            total_size += metadata.file_size_mb

    # Convert UnsupportedFile objects to UnsupportedFileInfo
    unsupported: list[UnsupportedFileInfo] = []
    for unsup in unsupported_files:
        unsupported.append(
            UnsupportedFileInfo(
                source_path=str(unsup.source_path),
                original_filename=unsup.original_filename,
                reason=unsup.reason
            )
        )

    return FileInspectResponse(
        supported=supported,
        unsupported=unsupported,
        total_duration_seconds=total_duration,
        total_size_mb=total_size
    )


# --- Output Folder Validation ---

def validate_output_folder(folder_path: str) -> dict[str, Any]:
    """
    Validate output folder: check if exists and writable.

    Args:
        folder_path: Path to output folder

    Returns:
        Dict with 'valid' boolean, 'exists' boolean, 'writable' boolean,
        'path' (resolved), and optional 'error' message
    """
    try:
        path = Path(folder_path).expanduser().resolve()

        exists = path.exists()
        writable = False
        error = None

        if exists:
            if not path.is_dir():
                error = "Path exists but is not a directory"
            else:
                # Check writability
                try:
                    test_file = path / ".mediscribe_write_test"
                    test_file.touch(exist_ok=True)
                    test_file.unlink()
                    writable = True
                except (OSError, PermissionError):
                    error = "Directory exists but is not writable"
        else:
            # Check if parent exists and is writable
            parent = path.parent
            if parent.exists() and parent.is_dir():
                try:
                    test_file = parent / ".mediscribe_write_test"
                    test_file.touch(exist_ok=True)
                    test_file.unlink()
                    writable = True
                except (OSError, PermissionError):
                    error = "Cannot create directory (parent not writable)"
            else:
                error = "Parent directory does not exist"

        valid = (exists and writable) or (not exists and writable)

        return {
            "valid": valid,
            "exists": exists,
            "writable": writable,
            "path": str(path),
            "error": error
        }
    except (ValueError, OSError, RuntimeError) as e:
        return {
            "valid": False,
            "exists": False,
            "writable": False,
            "path": folder_path,
            "error": f"Invalid path: {str(e)}"
        }


def ensure_output_folder(folder_path: str) -> dict[str, Any]:
    """
    Ensure output folder exists, creating if necessary.

    Args:
        folder_path: Path to output folder

    Returns:
        Dict with 'success' boolean, 'path' (resolved), 'created' boolean,
        and optional 'error' message
    """
    try:
        path = Path(folder_path).expanduser().resolve()
        created = False

        if not path.exists():
            path.mkdir(parents=True, exist_ok=True)
            created = True

        # Verify it's a directory and writable
        if not path.is_dir():
            return {
                "success": False,
                "path": str(path),
                "created": False,
                "error": "Path exists but is not a directory"
            }

        # Test writability
        try:
            test_file = path / ".mediscribe_write_test"
            test_file.touch(exist_ok=True)
            test_file.unlink()
        except (OSError, PermissionError) as e:
            return {
                "success": False,
                "path": str(path),
                "created": created,
                "error": f"Directory is not writable: {str(e)}"
            }

        return {
            "success": True,
            "path": str(path),
            "created": created,
            "error": None
        }
    except (ValueError, OSError, RuntimeError) as e:
        return {
            "success": False,
            "path": folder_path,
            "created": False,
            "error": f"Failed to create directory: {str(e)}"
        }
