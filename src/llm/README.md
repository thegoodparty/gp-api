# `src/llm/`

Centralized LLM call surface. Wraps OpenAI/LangChain so application code doesn't import vendor SDKs directly.

Use this module when you need an LLM call. Don't add new direct OpenAI imports outside `src/llm/services/`.
