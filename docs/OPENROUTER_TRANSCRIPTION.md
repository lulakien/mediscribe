# Optional OpenRouter transcription

The sandbox keeps local Whisper as the default. It can also send prepared
audio to OpenRouter's speech-to-text endpoint using Microsoft's
`microsoft/mai-transcribe-2` or `microsoft/mai-transcribe-1.5` model.

This is an explicit cloud opt-in. When it is enabled, the audio leaves the
Mac and there is no fallback to local transcription if the provider request
fails.

## Configure the key safely

The app never accepts an API-key value in Settings and never writes one to
the MediScribe config file. It stores only the name of the environment
variable to read at execution time. The default name is
`OPENROUTER_API_KEY`.

Set the key in the same shell that launches Electron:

```bash
cd /Users/bzy/mediscribe-lulakien-sandbox
export OPENROUTER_API_KEY='replace-with-your-key'
cd desktop
npm start
```

Do not commit the export command, put the key in `config.json`, or paste the
key into the repository or chat.

## Enable it

In the running app, open Settings → Cloud transcription and enable
OpenRouter. Choose one of the two Microsoft model IDs and, if needed, change
the environment-variable name. The Transcribe page then allows a job without
a locally downloaded Whisper model and shows the selected cloud provider.

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
- Request timeout is capped at 60 seconds.
- The key is read from the named environment variable and is not included in
  logs, manifests, errors, or persisted settings.
- Provider failures are recorded as failed jobs; the app does not silently
  switch providers or send the same audio to local Whisper.
- Tests use synthetic bytes and a fake HTTP transport. They do not contact
  OpenRouter and do not require a real key.

The integration follows OpenRouter's documented speech-to-text request shape;
see the provider documentation at
<https://openrouter.ai/docs/guides/overview/multimodal/stt> and the model
catalog entry at <https://openrouter.ai/microsoft/mai-transcribe-2>.
