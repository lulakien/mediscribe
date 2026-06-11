# Model Manager Implementation

Complete implementation of `desktop/backend/model_manager.py` according to DESIGN.md §10.3.

## Overview

The model manager provides:
- Static catalog of 4 Whisper models (large-v3, large-v3-turbo, medium, small)
- Installed model detection via `huggingface_hub.scan_cache_dir()`
- Model download via `snapshot_download` with progress tracking
- Test load functionality: instantiates WhisperModel, times it, releases it
- Model deletion with confirmation requirement
- REST endpoints for all operations

## Files Created/Modified

### 1. `/home/eren/Desktop/code-projects/mediscribe/desktop/backend/model_manager.py`
Main implementation file containing:
- `ModelInfo`: Dataclass for model catalog entries
- `ModelState`: Current state of each model
- `ModelManager`: Main manager class with thread-safe operations
- Singleton accessor: `get_model_manager()`

### 2. `/home/eren/Desktop/code-projects/mediscribe/desktop/backend/main.py`
Updated with REST endpoints:
- `GET /models` - Get all models with cache info
- `POST /models/refresh` - Refresh installed model detection
- `GET /models/{id}` - Get specific model state
- `POST /models/{id}/download` - Start download (background)
- `POST /models/{id}/download/cancel` - Cancel ongoing download
- `POST /models/{id}/test` - Test load model with timing
- `DELETE /models/{id}` - Delete model (requires confirm=true)

### 3. `/home/eren/Desktop/code-projects/mediscribe/desktop/backend/requirements.txt`
Updated with:
- `huggingface-hub>=0.20.0` (for cache scanning and downloads)

### 4. `/home/eren/Desktop/code-projects/mediscribe/desktop/backend/test_model_manager.py`
Test suite covering:
- Catalog validation
- Manager initialization
- Cache info retrieval
- Individual model queries
- Byte formatting
- Download validation
- Deletion safety

## Model Catalog

Static catalog per DESIGN.md §10.3:

| ID | Repo | Description | Size | Quality |
|----|------|-------------|------|---------|
| large-v3 | Systran/faster-whisper-large-v3 | Best quality. Recommended for lectures. | ~3.1 GB | ●●●● |
| large-v3-turbo | Systran/faster-whisper-large-v3-turbo | Nearly as accurate, noticeably faster. | ~1.6 GB | ●●●● |
| medium | Systran/faster-whisper-medium | Lighter fallback when VRAM is tight. | ~1.5 GB | ●●● |
| small | Systran/faster-whisper-small | Fast fallback for quick drafts. | ~0.5 GB | ●● |

## Key Features

### 1. Installed Detection
```python
manager.refresh_installed_models()
# Scans HF cache, updates status for all models
```

### 2. Download with Progress
```python
def progress_callback(event):
    print(event['message'])
    if 'percent' in event:
        print(f"Progress: {event['percent']:.1f}%")

manager.download_model("large-v3", progress_callback=progress_callback)
# Downloads in background thread, non-blocking
```

### 3. Test Load
```python
result = manager.test_model("large-v3", device="cuda", compute_type="float16")
# Returns: {success, load_time_s, vram_gb, error}
# Model is released immediately after timing
```

### 4. Delete with Confirmation
```python
result = manager.delete_model("large-v3", confirm=True)
# Returns: {success, reclaimed_bytes, reclaimed_readable}
```

## REST API Examples

### Get all models
```bash
curl http://127.0.0.1:8000/models
```

Response:
```json
{
  "models": [
    {
      "model_info": {
        "id": "large-v3",
        "repo_id": "Systran/faster-whisper-large-v3",
        "name": "large-v3",
        "description": "Best quality. The recommended model for lectures.",
        "approximate_size_gb": 3.1,
        "quality_dots": 4,
        "relative_speed": "standard"
      },
      "status": "installed",
      "size_on_disk_bytes": 3292814336,
      "last_test_result": null,
      "download_progress": null
    }
  ],
  "cache": {
    "cache_path": "~/.cache/huggingface",
    "total_size_bytes": 5123456789,
    "readable_size": "4.77 GB"
  }
}
```

### Download a model
```bash
curl -X POST http://127.0.0.1:8000/models/large-v3/download
```

Response:
```json
{
  "message": "Download started for large-v3",
  "model_id": "large-v3"
}
```

### Test load a model
```bash
curl -X POST http://127.0.0.1:8000/models/large-v3/test \
  -H "Content-Type: application/json" \
  -d '{"device": "cuda", "compute_type": "float16"}'
```

Response:
```json
{
  "success": true,
  "model_id": "large-v3",
  "load_time_s": 12.4,
  "vram_gb": 3.1,
  "device": "cuda",
  "compute_type": "float16",
  "message": "Model loaded successfully in 12.40s"
}
```

### Delete a model
```bash
curl -X DELETE http://127.0.0.1:8000/models/medium \
  -H "Content-Type: application/json" \
  -d '{"confirm": true}'
```

Response:
```json
{
  "message": "Model medium deleted successfully",
  "model_id": "medium",
  "reclaimed_bytes": 1573741824,
  "reclaimed_readable": "1.47 GB"
}
```

## Thread Safety

- All public methods use `threading.RLock()` for thread-safe access
- Downloads run in background threads (daemon=True)
- Test loads run via `asyncio.run_in_executor()` to avoid blocking the event loop
- Cancel flags use `threading.Event()` for safe signaling

## Error Handling

### Friendly CUDA OOM Messages
```python
# Transforms technical errors into user-friendly messages:
"torch.cuda.OutOfMemoryError" → 
"Not enough GPU memory for large-v3. Try the Low VRAM Safe preset, or free GPU memory and retry."
```

### Download Failures
- Network errors captured and reported via progress callback
- Partial downloads cleaned up on cancellation
- Status reverts to NOT_INSTALLED on failure

### Test Load Failures
- Errors stored in `last_test_result`
- Status set to FAILED_TO_LOAD
- Model properly released even on error (gc.collect() + torch.cuda.empty_cache())

## Model Status States

```
NOT_INSTALLED → [download] → DOWNLOADING → [complete] → INSTALLED
                                    ↓ [cancel]
                                    └─────────→ NOT_INSTALLED

INSTALLED → [test on CUDA success] → READY_ON_CUDA
INSTALLED → [test failure] → FAILED_TO_LOAD

ANY STATE → [delete confirm=true] → NOT_INSTALLED
```

## Cache Management

- Respects `HF_HOME` environment variable
- Falls back to `~/.cache/huggingface` if not set
- Scans all repos in cache
- Reports total cache size and per-model sizes
- Deletion uses `cache_info.delete_revisions()` API (safe, atomic)

## Testing

Run the test suite:
```bash
cd /home/eren/Desktop/code-projects/mediscribe/desktop/backend
python3 test_model_manager.py
```

Tests cover:
- Catalog structure validation
- Manager initialization
- Cache info retrieval
- Model state queries
- Byte formatting utility
- Download validation logic
- Deletion safety (requires confirmation)

## Integration with DESIGN.md

Implements all requirements from §10.3:

✓ Static catalog: 4 models from Systran/faster-whisper-* repos  
✓ Installed detection via `scan_cache_dir()`  
✓ Download via `snapshot_download` with progress  
✓ Test load: instantiate WhisperModel, time it, release  
✓ Delete with confirmation  
✓ REST endpoints: GET /models, POST /models/{id}/download, POST /models/{id}/test, DELETE /models/{id}  

Additional features:
- Cache info endpoint with total size
- Refresh endpoint for re-scanning
- Download cancellation
- Thread-safe concurrent operations
- VRAM measurement during test loads
- Human-readable size formatting

## Dependencies

Required packages (added to requirements.txt):
- `huggingface-hub>=0.20.0` - For cache management and downloads
- `faster-whisper==1.0.3` - For model instantiation (already present)

Optional (for VRAM measurement):
- `torch` with CUDA support - Detected and used if available

## Notes

1. **No API keys required**: All operations work with local Hugging Face cache
2. **Network only for downloads**: Model downloads are the only network operation
3. **Models released immediately**: Test loads don't keep models resident
4. **Confirmation required for deletion**: Safety guard against accidental deletion
5. **Progress tracking**: Download progress available via model state polling
6. **HF cache location**: Automatically detected, respects HF_HOME
7. **VRAM measurement**: Best-effort via torch.cuda.memory_allocated() when available

## Future Enhancements

Potential improvements (not in v1 scope):
- WebSocket/SSE for real-time download progress
- Parallel downloads (currently one at a time)
- Download resume on network failure
- Model size verification before download
- Bandwidth throttling options
- Custom model repo support (beyond the static catalog)
