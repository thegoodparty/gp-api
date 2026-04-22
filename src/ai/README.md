# `src/ai/`

App-level AI services that compose `src/llm/` for higher-level tasks (campaign content generation, area-code-from-zip lookups, etc.).

`ai.service.ts` is the orchestrator. `util/` has small helpers that are AI-adjacent but don't need their own module.
