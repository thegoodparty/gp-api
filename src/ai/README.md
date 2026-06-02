# `src/ai/`

App-level AI helpers that compose `src/llm/` for higher-level tasks
(campaign prompt templating, area-code-from-zip lookups). Reach for
`LlmService` directly for new LLM calls; this module exports
`PromptReplaceService` for campaign prompt token expansion and
`AreaCodeFromZipService` for the S3-cached zip → area code lookup.
