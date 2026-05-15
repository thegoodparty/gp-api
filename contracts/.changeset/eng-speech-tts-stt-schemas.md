---
'@goodparty_org/contracts': minor
---

Add speech (Text-to-Speech and Speech-to-Text) module schemas.

The speech module is a domain-agnostic "pure pipe": TTS in/out is plain text and audio URLs; STT in/out is audio frames and transcripts. Domain rendering and persistence are the caller's responsibility.

- `SynthesizeSpeechRequestSchema` / `SynthesizeSpeechResponseSchema` — TTS request/response for `POST /v1/speech/synthesize`. Request is `{ text, options? }`.
- `SYNTHESIZE_SPEECH_MAX_TEXT_LENGTH` — server-enforced cap on a single synthesis request.
- `SpeechSynthesisVoiceSchema` — allowlist of supported Polly neural voices.
- `SpeechSynthesisEngineSchema` — Polly engine enum.
- `TranscribeSessionRequestSchema` / `TranscribeSessionResponseSchema` — STT WebSocket session request/response for `POST /v1/speech/transcribe/session`. Request body is reserved as `{}` for forward-compatible options.
