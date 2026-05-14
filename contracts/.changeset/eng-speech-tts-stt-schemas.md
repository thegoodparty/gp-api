---
'@goodparty_org/contracts': minor
---

Add speech (Text-to-Speech and Speech-to-Text) module schemas.

- `SynthesizeSpeechRequestSchema` / `SynthesizeSpeechResponseSchema` — TTS request/response for `POST /v1/speech/synthesize`.
- `SpeechSynthesisVoiceSchema` — allowlist of supported Polly neural voices.
- `SpeechSynthesisEngineSchema` / `SpeechSynthesisTargetTypeSchema` — engine and target-type enums for TTS.
- `TranscribeSessionRequestSchema` / `TranscribeSessionResponseSchema` — STT WebSocket session request/response for `POST /v1/speech/transcribe/session`.
- `SpeechToTextTargetTypeSchema` — STT target-type enum (`note`).
