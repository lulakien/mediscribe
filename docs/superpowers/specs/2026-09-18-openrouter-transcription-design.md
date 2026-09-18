# OpenRouter Microsoft Transcription Design

**Date:** 2026-09-18

## Goal

Make the older `lulakien/mediscribe` application usable with an explicitly
configured cloud transcription provider when that provider is genuinely
available, while preserving the existing local Whisper path as the default.
The integration must not store or print an API key, must not transmit audio
unless the user has explicitly enabled the cloud backend, and must reuse the
existing transcription output and manifest contract.

## Feasibility decision

The premise is feasible, but it is narrower than “OpenRouter has a Microsoft
model” suggests. Current OpenRouter documentation exposes a dedicated speech-
to-text endpoint at `/api/v1/audio/transcriptions`, and the model catalog
contains `microsoft/mai-transcribe-2` and `microsoft/mai-transcribe-1.5` as
transcription models. The adapter therefore targets OpenRouter's documented
transcription endpoint rather than the chat-completions endpoint.

The implementation will support those two Microsoft model identifiers. It
will not pretend that any arbitrary OpenRouter model is a speech model, and it
will not add a speculative Azure SDK/provider. OpenRouter remains the provider
boundary; its Microsoft-backed Azure routing is selected by the model catalog
and provider options documented by OpenRouter.

## Architecture

`shared/transcribe_core.py` remains the provider-neutral boundary. It gains an
`openrouter_transcribe` backend and a small resolver that combines the job
options with the desktop's local configuration and process environment.

The existing `LocalWhisperBackend` remains the default. A backend factory
selects either local Whisper, the OpenRouter adapter, or the existing future
placeholder. The file-processing loop continues to prepare working audio,
write transcript artifacts, write manifests, and report progress through the
same code path for both local and cloud execution.

The OpenRouter adapter uses the Python standard library HTTP client. A
transport callable is injectable for tests, so tests can assert the exact
request without making an HTTP request or sending audio. The adapter accepts
the documented JSON/base64 request shape, requests verbose JSON for
`microsoft/mai-transcribe-2`, and uses the compatible plain JSON response for
`microsoft/mai-transcribe-1.5`.

## Activation and configuration

Cloud execution is opt-in through either of these paths:

1. Desktop local configuration: `apiGateway.enabled` must be `true` and
   `apiGateway.provider` must be `"openrouter"`.
2. A process-level override: `MEDISCRIBE_TRANSCRIPTION_BACKEND` must be
   `openrouter_transcribe` (or `local_whisper` to force local mode).

The API key is never a configuration value. `apiGateway.api_key_env_var`
contains only the name of an environment variable, defaulting to
`OPENROUTER_API_KEY`; the adapter reads the value at execution time and never
includes it in logs, manifests, errors, or persisted configuration. A
configured endpoint must be the canonical OpenRouter endpoint; arbitrary URLs
are rejected so that enabling the feature cannot silently redirect audio.

The cloud model defaults to `microsoft/mai-transcribe-2`. The optional
`microsoft/mai-transcribe-1.5` identifier is accepted for the documented
response-format difference. The local model, local device, and local compute
type remain unchanged when cloud mode is not explicitly selected.

## Data and output contract

For cloud execution, the existing FFmpeg working-audio preparation is reused.
The adapter sends only the prepared audio bytes, requested language when one
is configured, and the selected Microsoft transcription model. The returned
text and segment timing are mapped into the existing `BackendResult` and
`Segment` types. Existing TXT, Markdown, JSON, manifest, and progress output
paths remain unchanged.

The result records a provider warning that audio was sent to OpenRouter. The
warning is informational and contains no endpoint response body, key, audio,
or transcript content.

## Privacy and error handling

Local Whisper remains fail-closed with respect to cloud use: no cloud request
is made in the default path. Cloud mode is also fail-closed: a missing key,
invalid environment-variable name, non-canonical endpoint, HTTP failure, or
malformed response fails the file and does not fall back to local or another
provider. Error messages are sanitized to status/category information and do
not include request headers or response bodies.

The configuration validator rejects unknown gateway fields, including likely
secret-bearing fields such as `api_key`, `token`, `secret`, and authorization
headers. This prevents accidental persistence of a real key even when a
caller attempts to use the existing settings endpoint directly.

## Testing strategy

Focused tests will cover:

- local default and explicit cloud configuration resolution;
- rejection of secret-bearing or unknown persisted gateway fields;
- missing-key failure before the injectable transport is called;
- the exact OpenRouter request shape for both supported Microsoft models;
- safe mapping of segmented and plain text responses;
- sanitized HTTP and malformed-response failures; and
- job-manager resolution without changing the existing job lifecycle.

All tests use fake transport and synthetic bytes. No real key, audio, model
download, or API request is permitted.

## Files in scope

- `shared/transcribe_core.py`
- `desktop/backend/config_manager.py`
- `desktop/backend/job_manager.py`
- focused backend tests for the adapter and configuration
- `desktop/frontend/src/pages/Transcribe.tsx`
- `README.md`, `desktop/README.md`, `DESIGN.md`, and a focused OpenRouter
  configuration note

The desktop package manifests, Electron startup code, runtime data/cache
isolation, and the duplicate prototype implementation are intentionally out
of scope.
