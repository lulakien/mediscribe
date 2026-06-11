# Live State Audit Report

## Executive Summary

The MediScribe desktop application has critical live-state gaps that prevent users from seeing real-time feedback during transcription jobs. While the backend provides comprehensive progress tracking via WebSocket events and REST endpoints, the frontend relies heavily on polling and displays hardcoded placeholder values in key UI elements.

### Critical Problems

1. **Mock Data in Production UI**: Elapsed time, realtime factor, and audio processed counters are hardcoded to 0 and never update from backend data
2. **Polling Instead of WebSocket**: Jobs and Transcribe pages poll every 1-2 seconds instead of consuming existing WebSocket events, causing delayed updates and unnecessary server load
3. **Missing Cancellation Feedback**: "Stop after current file" button provides no visual feedback during the stopping phase; cancelled jobs appear as failed
4. **Static Log Viewer**: Run logs require manual refresh instead of streaming new lines as they're written
5. **Delayed Results Refresh**: Results page waits up to 2 seconds for polling instead of responding immediately to job completion events

### Impact

- Users see frozen counters during active transcription, undermining trust in the application
- Queue status updates lag behind actual processing, especially for fast files
- Cancellation requests appear unacknowledged until the job fully stops
- Poor user experience during monitoring long-running jobs

### Root Cause

The frontend was scaffolded with placeholder implementations while the backend was fully built. The WebSocket infrastructure exists on both sides but is only connected on the Models page. The Transcribe and Jobs pages were never wired to consume real-time events.

---

## Mock/Static UI Remnants by Component

### 1. Transcribe.tsx - Run Panel Metrics

**File**: `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/src/pages/Transcribe.tsx`

| Element | Lines | Current Value | Source |
|---------|-------|---------------|--------|
| Elapsed time | 147, 215, 373, 787-789 | `0` seconds | Hardcoded in runState initialization |
| Realtime factor | 148, 217, 374, 793-795 | `0.0x` | Hardcoded in runState initialization |
| Audio processed | 149, 218, 375, 800-802 | `0` seconds | Hardcoded in runState initialization |

**Evidence**:
```typescript
// Line 147-149 (initial state)
elapsed: 0,
realtimeFactor: 0,
audioProcessed: 0,

// Line 215-218 (when job starts)
elapsed: 0,
realtimeFactor: 0,
audioProcessed: 0,

// Line 373-375 (when creating new job)
elapsed: 0,
realtimeFactor: 0,
audioProcessed: 0,
```

**Display Code**:
```typescript
// Lines 787-802
<div className="text-sm text-muted-foreground">
  <div>Elapsed: {formatDuration(runState.elapsed)}</div>
</div>
<div className="text-sm text-muted-foreground">
  <div>Realtime: {runState.realtimeFactor.toFixed(1)}x</div>
</div>
<div className="text-sm text-muted-foreground">
  <div>Audio: {formatDuration(runState.audioProcessed)}</div>
</div>
```

### 2. Transcribe.tsx - Queue Row Duration

**File**: `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/src/pages/Transcribe.tsx`

| Element | Lines | Current Value | Issue |
|---------|-------|---------------|-------|
| File duration in queue rows | 183, 843 | `0` for active jobs | Lost when status_rows populate |

**Evidence**:
```typescript
// Line 183 - duration set to 0 for all files once job starts
duration: 0,

// Line 190 - duration preserved only when falling back to selectedFiles
duration: file.duration,
```

The duration metadata (obtained via ffprobe during file inspection) is displayed correctly before the job starts, but is discarded once the backend returns status_rows.

---

## Detailed Issue Breakdown

### Issue 1: Mock Elapsed Time Counter

**Component**: Transcribe.tsx (Run Panel)  
**Priority**: High  
**Type**: Mock Data

**Current Behavior**:
The elapsed time counter always displays "0s" during active transcription. The value is hardcoded in three places (lines 147, 215, 373) and never updates from backend data.

**Expected Behavior**:
Should display the actual elapsed wall-clock time since the job started, updating every second during active transcription. Format should be human-readable (e.g., "2m 34s", "1h 15m 42s").

**Backend Provides**:
- `RunMetrics.total_elapsed_time` (float, seconds) in `shared/transcribe_core.py` line 157
- Passed via `ProgressEvent.metrics.total_elapsed_time`
- Available in job state as `job.last_progress_event.metrics.total_elapsed_time`

**Fix Required**:
1. Extract `metrics.total_elapsed_time` from activeJob when available
2. Update runState.elapsed when job progress updates
3. Consider client-side interpolation (increment locally every second between backend updates for smooth display)

**Files to Change**:
- `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/src/pages/Transcribe.tsx` (lines 147, 215, 373, 787-789)

---

### Issue 2: Mock Realtime Factor Counter

**Component**: Transcribe.tsx (Run Panel)  
**Priority**: High  
**Type**: Mock Data

**Current Behavior**:
The realtime factor always displays "0.0x". This critical metric (showing transcription speed relative to audio duration) is hardcoded and never updates.

**Expected Behavior**:
Should display the actual realtime factor from the backend, formatted to 1 decimal place. For example, "2.5x" means transcription is 2.5 times faster than real-time playback.

**Backend Provides**:
- `RunMetrics.realtime_factor` (float) in `shared/transcribe_core.py` line 154
- Calculated as `total_processed_duration / total_elapsed_time` when elapsed > 0
- Passed via `ProgressEvent.metrics.realtime_factor`
- Available in job state as `job.last_progress_event.metrics.realtime_factor`

**Fix Required**:
1. Extract `metrics.realtime_factor` from activeJob when available
2. Update runState.realtimeFactor when job progress updates
3. Add smooth transition animation (200ms tween as specified in architecture context)

**Files to Change**:
- `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/src/pages/Transcribe.tsx` (lines 148, 217, 374, 793-795)

---

### Issue 3: Mock Audio Processed Counter

**Component**: Transcribe.tsx (Run Panel)  
**Priority**: High  
**Type**: Mock Data

**Current Behavior**:
The audio processed counter always displays "0s". This should show the total duration of audio that has been transcribed so far.

**Expected Behavior**:
Should display the cumulative audio duration processed, formatted as time (e.g., "5m 32s", "1h 23m 45s").

**Backend Provides**:
- `RunMetrics.total_processed_duration` (float, seconds) in `shared/transcribe_core.py` line 156
- Passed via `ProgressEvent.metrics.total_processed_duration`
- Available in job state as `job.last_progress_event.metrics.total_processed_duration`

**Fix Required**:
1. Extract `metrics.total_processed_duration` from activeJob when available
2. Update runState.audioProcessed when job progress updates
3. Use existing formatDuration helper (already used for elapsed time display)

**Files to Change**:
- `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/src/pages/Transcribe.tsx` (lines 149, 218, 375, 800-802)

---

### Issue 4: Polling-Based Job Updates (No WebSocket)

**Components**: Transcribe.tsx, Jobs.tsx  
**Priority**: High  
**Type**: Architecture Gap

**Current Behavior**:
- Jobs page polls `/jobs` every 2 seconds (refetchInterval: 2000)
- Transcribe page polls `/jobs/{id}` every 1 second when job is active
- No WebSocket integration on either page despite infrastructure existing
- Delayed status updates, especially noticeable for fast files

**Expected Behavior**:
- WebSocket events (`job_progress`, `job_state`) should push updates immediately
- Query invalidation triggered by WebSocket events
- Polling as fallback only (longer intervals like 10-30 seconds)

**Backend Provides**:
- `/ws/events` WebSocket endpoint (main.py lines 873-926)
- `job_progress` events pushed on every progress callback
- `job_state` events pushed on state transitions (queued → running → completed/failed/cancelled)
- JobManager queues events via `_progress_queue` (job_manager.py lines 320-395)

**Frontend Has**:
- WebSocket infrastructure in `websocket.ts`
- `useWebSocket` hook with event subscription
- Only Models page uses it (Models.tsx line 315)

**Fix Required**:
1. Add `useWebSocket` to Transcribe.tsx and Jobs.tsx
2. Subscribe to `job_progress` and `job_state` events
3. Call `queryClient.invalidateQueries(['jobs'])` on events
4. Extract metrics/status directly from WebSocket event payload instead of waiting for query refetch
5. Increase polling intervals to 30s as fallback

**Files to Change**:
- `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/src/pages/Transcribe.tsx`
- `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/src/pages/Jobs.tsx`
- `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/src/api/hooks.ts` (adjust refetchInterval)

---

### Issue 5: Cancelled Jobs Appear as Failed

**Component**: hooks.ts (Job type mapping)  
**Priority**: High  
**Type**: Data Loss

**Current Behavior**:
In `hooks.ts` line 59-67, the `toJob` function maps backend `cancelled` state to frontend `failed` status:
```typescript
status: job.state === 'cancelled' ? 'failed' : job.state as Job['status']
```

Cancelled jobs appear with red "Failed" badges in the UI, losing the distinction between user-requested stops and actual failures.

**Expected Behavior**:
Cancelled jobs should have their own status and visual treatment (e.g., gray/neutral badge with "Cancelled" label).

**Backend Provides**:
- `state: 'cancelled'` when job is stopped via cancel endpoint
- `cancel_requested: true` flag while stopping is in progress (line 232 in job_manager.py)

**Fix Required**:
1. Add `'cancelled'` to Job status union type in `types/index.ts`
2. Remove the mapping in `toJob` function, preserve `'cancelled'` as-is
3. Add cancelled state handling throughout UI (badges, conditional rendering)
4. Add distinct badge variant for cancelled status

**Files to Change**:
- `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/src/types/index.ts` (line 5)
- `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/src/api/hooks.ts` (line 59-67)
- `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/src/pages/Transcribe.tsx` (badge rendering)
- `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/src/pages/Jobs.tsx` (badge rendering)
- `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/src/components/ui/badge.tsx` (add cancelled variant)

---

### Issue 6: No Cancellation-In-Progress Feedback

**Component**: Transcribe.tsx (Stop button)  
**Priority**: High  
**Type**: Missing State

**Current Behavior**:
When "Stop after current file" is clicked:
1. Button briefly disables while API call is in flight
2. Button returns to normal enabled state once request completes
3. No visual indication that cancellation is in progress
4. Job still shows as "active" until it fully stops

**Expected Behavior**:
1. Button should show "Stopping..." text
2. Button remains disabled while `cancel_requested === true`
3. Progress panel shows "Completing current file..." status
4. Remaining pending files show as "Will be skipped"

**Backend Provides**:
- `cancel_requested: true` flag in job state (job_manager.py line 232)
- Job remains in `state: 'running'` until current file completes
- Then transitions to `state: 'cancelled'`

**Fix Required**:
1. Add `cancel_requested` to Job TypeScript type (currently implicit)
2. Check `activeJob.cancel_requested` to show stopping state
3. Change button text to "Stopping..." when true
4. Keep button disabled while true
5. Show visual indicator in progress panel
6. Gray out pending files in queue table

**Files to Change**:
- `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/src/types/index.ts` (add cancel_requested field)
- `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/src/pages/Transcribe.tsx` (lines 206-211, 826-839, 851-859)

---

### Issue 7: Static Log Viewer (No Live Tail)

**Component**: Advanced.tsx (Logs panel)  
**Priority**: Medium  
**Type**: Missing Feature

**Current Behavior**:
- Logs fetched via `/logs/preview` endpoint (reads entire file, up to 1MB)
- React Query with staleTime: 5000 (refetches every 5 seconds at most)
- No automatic refetch interval configured
- Users must manually click refresh to see new log lines
- Auto-scroll only triggers after full content replacement

**Expected Behavior**:
- Live tail behavior similar to `tail -f` during active jobs
- New log lines appear in real-time as they're written
- Auto-scroll incrementally with each new line
- No need for manual refresh

**Backend Gap**:
The `/logs/preview` endpoint (main.py lines 805-832) returns full file snapshot. No streaming endpoint exists (SSE or WebSocket).

**Fix Required**:
1. **Backend**: Add streaming endpoint `/logs/tail` using SSE or WebSocket
2. **Backend**: Tail the log file and push new lines as they're written
3. **Frontend**: Connect to streaming endpoint when log is selected
4. **Frontend**: Append new lines to viewer instead of replacing full content
5. **Frontend**: Auto-scroll incrementally with each line

**Files to Change**:
- `/home/eren/Desktop/code-projects/mediscribe/desktop/backend/main.py` (add streaming endpoint)
- `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/src/pages/Advanced.tsx` (connect to stream)
- `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/src/api/hooks.ts` (add streaming hook)

---

### Issue 8: Results Page Delayed Refresh

**Component**: Results.tsx  
**Priority**: Medium  
**Type**: Missing WebSocket Integration

**Current Behavior**:
- Results page polls `/jobs` every 2 seconds to detect completed jobs
- Up to 2-second delay before newly completed jobs appear
- No WebSocket integration despite events being pushed

**Expected Behavior**:
- Immediate refresh when job completes
- WebSocket `job_state` event triggers query invalidation
- Polling as fallback only

**Backend Provides**:
- `job_state` event pushed when job transitions to completed/failed/cancelled (job_manager.py lines 379-395)
- Manifest file written incrementally during job execution

**Fix Required**:
1. Add global WebSocket listener in App.tsx or WorkspaceShell.tsx
2. Subscribe to `job_state` events
3. Invalidate jobs query on job completion events
4. Increase polling interval to 30s as fallback

**Files to Change**:
- `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/src/App.tsx` or `WorkspaceShell.tsx`
- `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/src/api/hooks.ts` (adjust refetchInterval)

---

### Issue 9: Queue Row Duration Lost During Job

**Component**: Transcribe.tsx (Queue table)  
**Priority**: Medium  
**Type**: Data Loss

**Current Behavior**:
File duration metadata (obtained via ffprobe) is displayed in queue rows before job starts. Once the job starts and backend returns `status_rows`, duration is hardcoded to 0 (line 183). Duration only preserved when falling back to selectedFiles (line 190).

**Expected Behavior**:
Duration should be preserved and displayed throughout the job lifecycle.

**Backend Gap**:
`status_rows` in job state does not include duration field. The duration is probed in `transcribe_core.py` (line 518-530) but not included in status row data.

**Fix Required**:
1. **Backend**: Add `duration` field to status rows in job state
2. **Backend**: Include probed duration when available, 0 when probing failed
3. **Frontend**: Remove hardcoded `duration: 0` on line 183
4. **Frontend**: Use duration from status_rows when available

**Files to Change**:
- `/home/eren/Desktop/code-projects/mediscribe/shared/transcribe_core.py` (include duration in status updates)
- `/home/eren/Desktop/code-projects/mediscribe/desktop/backend/job_manager.py` (preserve duration in serialized status_rows)
- `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/src/pages/Transcribe.tsx` (line 183)

---

### Issue 10: Progress Percentage Normalization Inconsistency

**Component**: hooks.ts (toJob function)  
**Priority**: Medium  
**Type**: Data Inconsistency Risk

**Current Behavior**:
The `toJob` function (line 72 in hooks.ts) normalizes progress:
```typescript
progress: job.progress <= 1 ? job.progress * 100 : job.progress
```

This assumes backend might send either 0-1 or 0-100 range, creating ambiguity.

**Expected Behavior**:
Backend should consistently send progress in one range (preferably 0-1). Frontend should consistently convert to percentage (0-100) for display.

**Backend Sends**:
`ProgressEvent.progress` is a float 0-1 (shared/transcribe_core.py line 146)

**Fix Required**:
1. Verify backend always sends 0-1 range
2. Remove conditional normalization, always multiply by 100
3. Add comment documenting the expected range

**Files to Change**:
- `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/src/api/hooks.ts` (line 72)

---

### Issue 11: Status Row Field Name Inconsistency

**Component**: Transcribe.tsx (Queue table)  
**Priority**: Medium  
**Type**: Backend Inconsistency

**Current Behavior**:
Lines 185-186 check multiple possible field names:
```typescript
const warning = row['warning/error'] || row.warning
```

This suggests the backend sends inconsistent field names.

**Expected Behavior**:
Backend should use consistent field naming. Frontend should not need to check multiple variations.

**Investigation Needed**:
Check what field names the backend actually sends in status_rows.

**Files to Check**:
- `/home/eren/Desktop/code-projects/mediscribe/shared/transcribe_core.py` (status row construction)
- `/home/eren/Desktop/code-projects/mediscribe/desktop/backend/job_manager.py` (status row serialization)

---

### Issue 12: Missing backend_status Event

**Component**: Backend WebSocket  
**Priority**: Low  
**Type**: Missing Event

**Current Behavior**:
Backend emits `connected`, `job_progress`, `job_state`, `model_download` events. No `backend_status` event exists.

**Expected Behavior**:
According to architecture context, a `backend_status` event should communicate backend health changes (running/degraded/down).

**Fix Required**:
1. **Backend**: Implement health monitoring
2. **Backend**: Push `backend_status` event on health state changes
3. **Frontend**: Subscribe to event in StatusFooter component
4. **Frontend**: Update backend status indicator in footer

**Files to Change**:
- `/home/eren/Desktop/code-projects/mediscribe/desktop/backend/main.py` (add event emission)
- `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/src/components/StatusFooter.tsx`

---

## Recommended Event/State Model

### Backend Event Types

The backend should emit the following WebSocket events with consistent structure:

```typescript
// Connection lifecycle
type ConnectedEvent = {
  type: 'connected'
  backend_version: string
  timestamp: string
}

// Job lifecycle
type JobCreatedEvent = {
  type: 'job_created'
  job_id: string
  timestamp: string
}

type JobQueuedEvent = {
  type: 'job_queued'
  job_id: string
  queue_position: number
  timestamp: string
}

type JobStartedEvent = {
  type: 'job_started'
  job_id: string
  timestamp: string
  total_files: number
}

type JobStopRequestedEvent = {
  type: 'job_stop_requested'
  job_id: string
  timestamp: string
  files_remaining: number
}

type JobCompletedEvent = {
  type: 'job_completed'
  job_id: string
  timestamp: string
  total_files: number
  successful: number
  failed: number
  skipped: number
  total_duration: number
}

type JobFailedEvent = {
  type: 'job_failed'
  job_id: string
  timestamp: string
  error: string
}

type JobCancelledEvent = {
  type: 'job_cancelled'
  job_id: string
  timestamp: string
  files_completed: number
  files_skipped: number
}

// File-level events (within a job)
type FileQueuedEvent = {
  type: 'file_queued'
  job_id: string
  file_path: string
  file_index: number
  timestamp: string
}

type FileProbingEvent = {
  type: 'file_probing'
  job_id: string
  file_path: string
  file_index: number
  timestamp: string
}

type FileStartedEvent = {
  type: 'file_started'
  job_id: string
  file_path: string
  file_index: number
  timestamp: string
  duration?: number // audio duration in seconds
}

type FileProgressEvent = {
  type: 'file_progress'
  job_id: string
  file_path: string
  file_index: number
  timestamp: string
  message: string
  // Aggregate metrics
  metrics: {
    total_elapsed_time: number
    total_processed_duration: number
    realtime_factor: number
    files_completed: number
    files_failed: number
    files_skipped: number
  }
  // Overall job progress 0-1
  progress: number
}

type FileCompletedEvent = {
  type: 'file_completed'
  job_id: string
  file_path: string
  file_index: number
  timestamp: string
  duration: number // wall clock time for this file
  audio_duration: number
  realtime_factor: number
  output_files: string[] // paths to TXT, MD, JSON outputs
}

type FileFailedEvent = {
  type: 'file_failed'
  job_id: string
  file_path: string
  file_index: number
  timestamp: string
  error: string
  is_fatal: boolean
}

type FileSkippedEvent = {
  type: 'file_skipped'
  job_id: string
  file_path: string
  file_index: number
  timestamp: string
  reason: 'already_exists' | 'cancelled' | 'dry_run'
}

// Model management events
type ModelDownloadProgressEvent = {
  type: 'model_download_progress'
  model_id: string
  timestamp: string
  bytes_downloaded: number
  total_bytes?: number
  percent?: number
  status: 'downloading' | 'completed' | 'failed'
  error?: string
}

type ModelTestEvent = {
  type: 'model_test'
  model_id: string
  timestamp: string
  status: 'testing' | 'success' | 'failed'
  load_time_ms?: number
  vram_mb?: number
  error?: string
}

// System events
type BackendStatusEvent = {
  type: 'backend_status'
  timestamp: string
  status: 'running' | 'degraded' | 'down'
  cuda_available: boolean
  current_model?: string
}

// Log streaming
type LogLineEvent = {
  type: 'log_line'
  job_id?: string
  timestamp: string
  level: 'INFO' | 'WARNING' | 'ERROR' | 'DEBUG'
  message: string
}

// Union type
type WebSocketEvent = 
  | ConnectedEvent
  | JobCreatedEvent
  | JobQueuedEvent
  | JobStartedEvent
  | JobStopRequestedEvent
  | JobCompletedEvent
  | JobFailedEvent
  | JobCancelledEvent
  | FileQueuedEvent
  | FileProbingEvent
  | FileStartedEvent
  | FileProgressEvent
  | FileCompletedEvent
  | FileFailedEvent
  | FileSkippedEvent
  | ModelDownloadProgressEvent
  | ModelTestEvent
  | BackendStatusEvent
  | LogLineEvent
```

### Event Emission Points

**In transcribe_core.py**:
- `FileQueuedEvent`: When file is added to processing list
- `FileProbingEvent`: Before ffprobe call
- `FileStartedEvent`: After successful probe, before transcription
- `FileProgressEvent`: During transcription (existing progress callback)
- `FileCompletedEvent`: After successful transcription and file writes
- `FileFailedEvent`: On transcription errors
- `FileSkippedEvent`: When file skipped (existing, dry run, cancelled)

**In job_manager.py**:
- `JobCreatedEvent`: In create_job()
- `JobQueuedEvent`: When job added to queue
- `JobStartedEvent`: When worker picks job from queue
- `JobStopRequestedEvent`: In cancel_job()
- `JobCompletedEvent`: When all files processed successfully
- `JobFailedEvent`: When job fails
- `JobCancelledEvent`: When job stops due to cancellation

**In main.py**:
- `BackendStatusEvent`: On startup, CUDA state changes
- `ModelDownloadProgressEvent`: During model downloads
- `ModelTestEvent`: During model test loads
- `LogLineEvent`: When streaming logs

---

## Frontend State Shape Recommendation

### Zustand Store Structure

```typescript
// Store: useJobStore
interface JobStore {
  // Normalized job data
  jobs: Record<string, Job>
  
  // Active job tracking
  activeJobId: string | null
  
  // Normalized file data (within active job)
  files: Record<string, FileState>
  fileOrder: string[] // ordered list of file paths
  
  // Aggregate metrics (derived from active job)
  metrics: {
    elapsed: number
    realtimeFactor: number
    audioProcessed: number
    filesCompleted: number
    filesFailed: number
    filesSkipped: number
    progress: number // 0-100
  }
  
  // Connection status
  connectionStatus: 'connected' | 'connecting' | 'disconnected'
  
  // Actions
  setJob: (job: Job) => void
  updateJobMetrics: (jobId: string, metrics: RunMetrics) => void
  setFileStatus: (filePath: string, status: FileStatus) => void
  setActiveJob: (jobId: string | null) => void
  clearActiveJob: () => void
}

// File state within a job
interface FileState {
  path: string
  filename: string
  duration?: number // audio duration from probe
  status: 'pending' | 'probing' | 'processing' | 'completed' | 'failed' | 'skipped'
  progress?: number // 0-1 for current file (future enhancement)
  error?: string
  warning?: string
  startTime?: number // timestamp
  endTime?: number // timestamp
  wallTime?: number // seconds spent processing this file
  realtimeFactor?: number // specific to this file
  outputFiles?: string[] // paths to outputs
}

// Job type (extend existing)
interface Job {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  cancel_requested: boolean
  created_at: string
  started_at?: string
  completed_at?: string
  progress: number // 0-100
  current_file?: string
  total_files: number
  
  // Counts
  files_completed: number
  files_failed: number
  files_skipped: number
  
  // Metrics
  metrics?: {
    total_elapsed_time: number
    total_processed_duration: number
    realtime_factor: number
  }
  
  // Configuration
  output_folder: string
  model: string
  options: TranscriptionOptions
  
  // State details
  status_rows?: FileState[]
  error?: string
  result?: TranscriptionResult
}
```

### State Update Flow

1. **WebSocket event received** → Parse event type
2. **Update Zustand store** → Optimistic update (don't wait for query refetch)
3. **Invalidate TanStack Query** → Trigger background refetch for consistency
4. **UI re-renders** → React to Zustand store changes immediately

Example flow for FileCompletedEvent:
```typescript
const handleWebSocketEvent = (event: WebSocketEvent) => {
  if (event.type === 'file_completed') {
    // 1. Update Zustand immediately
    jobStore.setFileStatus(event.file_path, {
      status: 'completed',
      wallTime: event.duration,
      realtimeFactor: event.realtime_factor,
      outputFiles: event.output_files
    })
    
    // 2. Invalidate query (background consistency check)
    queryClient.invalidateQueries(['jobs', event.job_id])
  }
}
```

---

## Backend Changes Needed

### 1. Expand WebSocket Event Types

**File**: `/home/eren/Desktop/code-projects/mediscribe/desktop/backend/main.py`

Add new event emission helpers:
```python
async def broadcast_event(event_type: str, data: dict):
    """Broadcast event to all connected WebSocket clients"""
    event = {"type": event_type, "timestamp": datetime.now().isoformat(), **data}
    for connection in active_connections:
        await connection.send_json(event)
```

Emit granular events:
- `job_created`, `job_queued`, `job_started` in job lifecycle
- `job_stop_requested` when cancellation requested
- `file_started`, `file_completed`, `file_failed`, `file_skipped` for each file
- `backend_status` on health changes

### 2. Include Duration in Status Rows

**File**: `/home/eren/Desktop/code-projects/mediscribe/shared/transcribe_core.py`

Modify status row construction to include duration:
```python
status_row = {
    "file": file_path,
    "status": status,
    "duration": probed_duration,  # Add this
    "error": error_message
}
```

Update in:
- Line ~451 (completed files)
- Line ~494 (failed files)
- Line ~599 (skipped files)
- Line ~640 (dry run files)

### 3. Add Log Streaming Endpoint

**File**: `/home/eren/Desktop/code-projects/mediscribe/desktop/backend/main.py`

Add SSE endpoint for live log tailing:
```python
from fastapi.responses import StreamingResponse
import asyncio

@app.get("/logs/tail")
async def tail_logs(path: str):
    """Stream log file lines as they're written"""
    async def log_generator():
        with open(path,
