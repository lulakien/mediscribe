"""Tests for file_manager module."""

import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))

from file_manager import (
    AUDIO_EXTENSIONS,
    inspect_files,
    validate_path,
    is_audio_extension,
    seconds_to_hms,
    validate_output_folder,
    ensure_output_folder,
)


def test_audio_extensions_imported():
    """Test that AUDIO_EXTENSIONS is correctly imported from transcribe_core."""
    assert isinstance(AUDIO_EXTENSIONS, set)
    assert ".mp3" in AUDIO_EXTENSIONS
    assert ".wav" in AUDIO_EXTENSIONS
    assert ".m4a" in AUDIO_EXTENSIONS
    assert ".flac" in AUDIO_EXTENSIONS


def test_is_audio_extension():
    """Test audio extension validation."""
    assert is_audio_extension(Path("test.mp3")) is True
    assert is_audio_extension(Path("test.MP3")) is True  # Case insensitive
    assert is_audio_extension(Path("test.wav")) is True
    assert is_audio_extension(Path("test.txt")) is False
    assert is_audio_extension(Path("test.pdf")) is False


def test_seconds_to_hms():
    """Test seconds to HH:MM:SS conversion."""
    assert seconds_to_hms(None) is None
    assert seconds_to_hms(0) == "00:00"
    assert seconds_to_hms(59) == "00:59"
    assert seconds_to_hms(60) == "01:00"
    assert seconds_to_hms(3661) == "01:01:01"
    assert seconds_to_hms(7325) == "02:02:05"


def test_validate_path_nonexistent():
    """Test path validation with nonexistent file."""
    result = validate_path("/nonexistent/file.mp3")
    assert result is None


def test_validate_path_with_tempfile():
    """Test path validation with a real temp file."""
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        result = validate_path(tmp_path)
        assert result is not None
        assert result.exists()
        assert result.is_file()
    finally:
        Path(tmp_path).unlink()


def test_inspect_files_empty():
    """Test inspecting empty file list."""
    result = inspect_files([], ffprobe_path=None)

    assert len(result.supported) == 0
    assert len(result.unsupported) == 0
    assert result.total_duration_seconds == 0.0
    assert result.total_size_mb == 0.0


def test_inspect_files_nonexistent():
    """Test inspecting nonexistent files."""
    result = inspect_files(["/nonexistent/file.mp3"], ffprobe_path=None)

    assert len(result.supported) == 0
    assert len(result.unsupported) == 1
    assert "does not exist" in result.unsupported[0].reason.lower()


def test_inspect_files_unsupported_extension():
    """Test inspecting file with unsupported extension."""
    with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as tmp:
        tmp.write(b"test content")
        tmp_path = tmp.name

    try:
        result = inspect_files([tmp_path], ffprobe_path=None)

        assert len(result.supported) == 0
        assert len(result.unsupported) == 1
        assert "unsupported" in result.unsupported[0].reason.lower()
    finally:
        Path(tmp_path).unlink()


def test_inspect_files_supported_without_ffprobe():
    """Test inspecting supported audio file without ffprobe."""
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp.write(b"fake mp3 content")
        tmp_path = tmp.name

    try:
        result = inspect_files([tmp_path], ffprobe_path=None)

        # File should be in supported list
        assert len(result.supported) == 1
        assert len(result.unsupported) == 0

        file_info = result.supported[0]
        assert file_info.source_path == tmp_path
        assert file_info.original_filename == Path(tmp_path).name
        assert file_info.file_size_mb is not None
        assert file_info.file_size_mb >= 0

        # Without ffprobe, duration/codec should be None but with warning
        assert file_info.duration_seconds is None
        assert "ffprobe missing" in file_info.warnings[0].lower()
    finally:
        Path(tmp_path).unlink()


def test_validate_output_folder_nonexistent():
    """Test validating nonexistent output folder."""
    with tempfile.TemporaryDirectory() as tmpdir:
        nonexistent = Path(tmpdir) / "output"
        result = validate_output_folder(str(nonexistent))

        assert result['valid'] is True  # Parent exists and writable
        assert result['exists'] is False
        assert result['writable'] is True


def test_validate_output_folder_existing():
    """Test validating existing output folder."""
    with tempfile.TemporaryDirectory() as tmpdir:
        result = validate_output_folder(tmpdir)

        assert result['valid'] is True
        assert result['exists'] is True
        assert result['writable'] is True
        assert result['error'] is None


def test_ensure_output_folder_creates():
    """Test ensuring output folder creates it if needed."""
    with tempfile.TemporaryDirectory() as tmpdir:
        new_folder = Path(tmpdir) / "new_output"

        assert not new_folder.exists()

        result = ensure_output_folder(str(new_folder))

        assert result['success'] is True
        assert result['created'] is True
        assert new_folder.exists()
        assert new_folder.is_dir()


def test_ensure_output_folder_existing():
    """Test ensuring existing output folder."""
    with tempfile.TemporaryDirectory() as tmpdir:
        result = ensure_output_folder(tmpdir)

        assert result['success'] is True
        assert result['created'] is False
        assert result['error'] is None


if __name__ == "__main__":
    # Run basic tests
    print("Testing AUDIO_EXTENSIONS import...")
    test_audio_extensions_imported()
    print("✓ AUDIO_EXTENSIONS imported correctly")

    print("\nTesting audio extension validation...")
    test_is_audio_extension()
    print("✓ Extension validation works")

    print("\nTesting seconds to HH:MM:SS conversion...")
    test_seconds_to_hms()
    print("✓ Time conversion works")

    print("\nTesting file inspection with empty list...")
    test_inspect_files_empty()
    print("✓ Empty file list handled")

    print("\nTesting file inspection with nonexistent file...")
    test_inspect_files_nonexistent()
    print("✓ Nonexistent files detected")

    print("\nTesting file inspection with unsupported extension...")
    test_inspect_files_unsupported_extension()
    print("✓ Unsupported extensions detected")

    print("\nTesting file inspection with supported file (no ffprobe)...")
    test_inspect_files_supported_without_ffprobe()
    print("✓ Supported files processed")

    print("\nTesting output folder validation...")
    test_validate_output_folder_existing()
    test_validate_output_folder_nonexistent()
    print("✓ Output folder validation works")

    print("\nTesting output folder creation...")
    test_ensure_output_folder_creates()
    test_ensure_output_folder_existing()
    print("✓ Output folder creation works")

    print("\n✅ All tests passed!")
