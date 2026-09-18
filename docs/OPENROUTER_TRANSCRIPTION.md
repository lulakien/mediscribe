# Optional OpenRouter transcription

The sandbox keeps local Whisper as the default. It can also send prepared
audio to OpenRouter's speech-to-text endpoint using Microsoft's
`microsoft/mai-transcribe-2` or `microsoft/mai-transcribe-1.5` model.

This is an explicit cloud opt-in. When it is enabled, the audio leaves the
Mac and there is no fallback to local transcription if the provider request
fails.

## Configure the key safely

In the desktop app, paste the key into Settings → Cloud transcription. The
sandbox stores it in the macOS Keychain under its own service identity and
stores only provider metadata in `config.json`. The key field is cleared after
a successful save; a later visit shows only that a key is configured, never the
credential itself. The in-app Keychain value takes priority over the optional
environment fallback.

For scripted launches, the app still supports an environment variable. The
default name is `OPENROUTER_API_KEY`.

Set the key in the same shell that launches Electron when using the fallback:

```bash
cd /Users/bzy/mediscribe-lulakien-sandbox
export OPENROUTER_API_KEY='replace-with-your-key'
cd desktop
npm start
```

Do not commit the export command, put the key in `config.json`, or paste the
key into the repository or chat. Do not use the environment fallback and the
Keychain entry for different accounts unless that is intentional.

## Enable it

In the running app, open Settings → Cloud transcription, save the key, and
enable OpenRouter. Choose one of the two Microsoft model IDs and, if needed,
change the environment-variable name used by scripted launches. The
Transcribe page then allows a job without a locally downloaded Whisper model
and shows the selected cloud provider.

The backend also supports an operator-level override for scripted launches:

```bash
export MEDISCRIBE_TRANSCRIPTION_BACKEND=openrouter_transcribe
export OPENROUTER_API_KEY='replace-with-your-key'
cd /Users/bzy/mediscribe-lulakien-sandbox/desktop
npm start
```

Use `MEDISCRIBE_TRANSCRIPTION_BACKEND=local_whisper` to force local mode even
when the saved gateway setting is enabled.

## Boundaries

- The endpoint is fixed to `https://openrouter.ai/api/v1/audio/transcriptions`.
- Supported models are `microsoft/mai-transcribe-2` and
  `microsoft/mai-transcribe-1.5`.
- The Azure-backed Microsoft provider accepts WAV, MP3, and FLAC reliably. The
  desktop converts other supported inputs such as M4A to a 16 kHz mono WAV
  with FFmpeg before sending them to OpenRouter.
- Request timeout is capped at 60 seconds.
- The key is read from the sandbox Keychain first, then the named environment
  variable, and is not included in logs, manifests, errors, or persisted JSON
  settings.
- Provider failures are recorded as failed jobs; the app does not silently
  switch providers or send the same audio to local Whisper.
- Tests use synthetic bytes and a fake HTTP transport. They do not contact
  OpenRouter and do not require a real key.

The integration follows OpenRouter's documented speech-to-text request shape;
see the provider documentation at
<https://openrouter.ai/docs/guides/overview/multimodal/stt> and the model
catalog entry at <https://openrouter.ai/microsoft/mai-transcribe-2>.
