"""
Test script for model_manager.py

Verifies the implementation without requiring actual model downloads.
"""

import platform
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from model_manager import (
    get_model_manager,
    MODEL_CATALOG,
    ModelStatus
)


def test_large_v3_uses_native_mlx_catalog_on_apple_silicon():
    large_v3 = next(model for model in MODEL_CATALOG if model.id == "large-v3")

    if sys.platform == "darwin" and platform.machine().lower() in {"arm64", "aarch64"}:
        assert large_v3.backend == "mlx"
        assert large_v3.repo_id == "mlx-community/whisper-large-v3-mlx"
    else:
        assert large_v3.backend == "faster-whisper"


def test_catalog():
    """Test that catalog is correctly defined."""
    print("Testing catalog...")
    assert len(MODEL_CATALOG) == 4, "Expected 4 models in catalog"

    model_ids = [m.id for m in MODEL_CATALOG]
    expected_ids = ["large-v3", "large-v3-turbo", "medium", "small"]
    assert model_ids == expected_ids, f"Expected {expected_ids}, got {model_ids}"

    # Check repo IDs
    for model in MODEL_CATALOG:
        assert model.repo_id.startswith(("Systran/faster-whisper-", "mlx-community/whisper-"))
        assert model.backend in {"faster-whisper", "mlx"}
        assert model.approximate_size_gb > 0
        assert 1 <= model.quality_dots <= 4

    print("✓ Catalog structure is correct")


def test_manager_initialization():
    """Test that manager initializes correctly."""
    print("\nTesting manager initialization...")

    manager = get_model_manager()

    # Get all models
    models = manager.get_all_models()
    assert len(models) == 4, f"Expected 4 models, got {len(models)}"

    # Check that all models have correct structure
    for model in models:
        assert 'model_info' in model
        assert 'status' in model
        assert model['status'] in [s.value for s in ModelStatus]

    print("✓ Manager initializes correctly")


def test_cache_info():
    """Test cache info retrieval."""
    print("\nTesting cache info...")

    manager = get_model_manager()
    cache_info = manager.get_cache_info()

    if cache_info:
        assert hasattr(cache_info, 'cache_path')
        assert hasattr(cache_info, 'total_size_bytes')
        assert hasattr(cache_info, 'readable_size')
        print(f"✓ Cache info retrieved: {cache_info.cache_path}")
        print(f"  Total size: {cache_info.readable_size}")
    else:
        print("⚠ Cache info not available (cache may be empty or inaccessible)")


def test_get_model():
    """Test getting individual model state."""
    print("\nTesting get_model...")

    manager = get_model_manager()

    # Get a valid model
    model = manager.get_model("large-v3")
    assert model is not None
    assert model['model_info']['id'] == "large-v3"
    print(f"✓ Retrieved large-v3: status={model['status']}")

    # Try invalid model
    invalid = manager.get_model("nonexistent")
    assert invalid is None
    print("✓ Returns None for invalid model")


def test_format_bytes():
    """Test byte formatting utility."""
    print("\nTesting byte formatting...")

    from model_manager import ModelManager

    assert ModelManager._format_bytes(None) == "unknown"
    assert ModelManager._format_bytes(0) == "0 B"
    assert ModelManager._format_bytes(1023) == "1023 B"
    assert ModelManager._format_bytes(1024) == "1.00 KB"
    assert ModelManager._format_bytes(1024 * 1024) == "1.00 MB"
    assert ModelManager._format_bytes(int(3.1 * 1024 * 1024 * 1024)) == "3.10 GB"

    print("✓ Byte formatting works correctly")


def test_download_validation():
    """Test download validation without actually downloading."""
    print("\nTesting download validation...")

    manager = get_model_manager()

    # Try to download a model (will fail since we're not actually downloading)
    # This just tests the validation logic
    success = manager.download_model("nonexistent")
    assert success is False, "Should fail for nonexistent model"

    print("✓ Download validation works")


def test_delete_without_confirmation():
    """Test that deletion requires confirmation."""
    print("\nTesting deletion safety...")

    manager = get_model_manager()

    # Try to delete without confirmation
    result = manager.delete_model("large-v3", confirm=False)
    assert result['success'] is False
    assert 'confirmation' in result['error'].lower()

    print("✓ Deletion requires confirmation")


def main():
    """Run all tests."""
    print("=" * 60)
    print("Model Manager Test Suite")
    print("=" * 60)

    try:
        test_catalog()
        test_manager_initialization()
        test_cache_info()
        test_get_model()
        test_format_bytes()
        test_download_validation()
        test_delete_without_confirmation()

        print("\n" + "=" * 60)
        print("✓ All tests passed!")
        print("=" * 60)
        return 0

    except AssertionError as e:
        print(f"\n✗ Test failed: {e}")
        return 1
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
