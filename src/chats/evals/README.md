# Chat Evals

Behavioral LLM tests for chat system prompts.

## What these are

Evals are **behavioral contracts** verified against a real LLM. They're
different from unit tests:

- Unit tests (`*.test.ts`) — fast, deterministic, no network. Assert prompt
  builder shape, fixture structure, sanitization, etc.
- Integration tests (`*.integration.test.ts`) — also no LLM. Compose the
  prompt builder with realistic fixtures and assert the rendered prompt
  contains every expected block.
- Evals (`*.eval.test.ts`) — call the real LLM with the real prompt and
  assert the model **behaves** the way the prompt promises. Cost money.
  Gated by `RUN_LLM_EVALS=1`. Skipped by default.

## How to run

```bash
# Run a single eval file (uses real keys from .env)
RUN_LLM_EVALS=1 npx vitest run \
  src/chats/briefing-chats/evals/briefingChatPrompt.eval.test.ts

# Run every eval across the chats module
RUN_LLM_EVALS=1 npx vitest run \
  'src/chats/**/evals/**/*.eval.test.ts'

# Narrow to one case
RUN_LLM_EVALS=1 npx vitest run \
  src/chats/briefing-chats/evals/briefingChatPrompt.eval.test.ts \
  -t "off-topic"
```

Without `RUN_LLM_EVALS=1` the eval `describe` block self-skips. The cases
still show up in vitest output as "skipped" so the eval coverage is
discoverable from the test runner UI.

## Costs

With Claude Sonnet 4.6 (default in `AI_MODELS`) — roughly **\$0.01 per
case**. A full pass with ~25 cases is **~\$0.25**.

Per-eval call is `streamChatCompletion` with `maxOutputTokens: 512`,
`temperature: 0`, `maxSteps: 4`. Don't bump those without a reason.

## When to add an eval

Any time you **change a system prompt block**, add an eval case that
asserts the new behavior holds against the real LLM. Examples:

- Tighten a guardrail → add a case that previously slipped through and
  must now decline.
- Add a new tool to the prompt → add a case that the model invokes it
  when it should and abstains when it shouldn't.
- Add a sanitization rule → add a case with adversarial highlight content
  that previously leaked.

The integration test catches "is the block in the prompt at all?" The
eval catches "does the model actually respect the block?"

## When evals fail

99% of the time, a failing eval is a **prompt regression** — someone
changed the prompt builder and a behavior the prompt used to guarantee
no longer holds. Read the failing case carefully:

- Failure inside `mustContain` / `mustNotContain` / `custom` → look at
  the offending response. Was the user message ambiguous? Does the
  prompt still tell the model to do this thing?
- Same response across multiple cases → the prompt is broken in a
  shared way (e.g. guardrail wording changed, sanitization broke).

If the model legitimately got better at something we used to require it
to refuse, **loosen the assertion** — don't disable the case.

If the test was wrong (assertion too tight, expected string mismatched
the model's normal phrasing), **fix the test** — don't change the
prompt.

The 1% that aren't regressions are usually model-side drift: a new
model version interprets a prompt slightly differently. Note it in the
PR description, loosen if needed, move on.

## File layout

```
src/chats/evals/
  README.md              # this file
  runEval.ts             # mustContain / mustNotContain / custom helpers
  envOverride.ts         # force-load .env over .env.test
src/chats/<feature>/evals/
  fixtures/              # realistic prompt-builder args
  <thing>.integration.test.ts   # no LLM — builder + fixture
  <thing>.eval.test.ts          # real LLM, gated
```
