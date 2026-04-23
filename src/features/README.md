# `src/features/`

Feature-flag service. Wraps Amplitude Experiment for runtime feature toggles.

`services/features.service.ts` is the public surface. Inject it; ask it whether a flag is on for a user. Don't read `process.env` for feature toggles — go through this service so flags can be changed without redeploys.
