# Campaign AI Chat — Contentful change-list

These are the **manual Contentful edits** that pair with the code changes on
`feat/campaign-chat-quick-wins`. The app reads the Contentful entry as
**read-only** (one-way sync), so these must be made in Contentful directly.

**Entry:** the `aiChatPrompt` content entry (loaded in
`content.service.ts → getChatSystemPrompt`).

**Fields used by the code:**

- `systemPrompt` — system prompt for follow-up messages in an existing thread.
- `initialPrompt` — system prompt for the **first** message of a new thread.
- `candidateJson` — JSON object of candidate/campaign context. Supports
  `[[token]]` placeholders and the `${today}` token.

> The code already appends a Markdown formatting directive **and** a
> response-depth directive to whichever prompt is selected, and the output
> token budget is 2000. So the CMS no longer needs to carry formatting rules or
> brevity caps — the edits below remove the parts that now fight the code.

---

## 1. Loosen the "keep it brief" guidance (lengthen answers)

In **`systemPrompt`** and **`initialPrompt`**, find any instruction that caps
length or pushes brevity, e.g. phrases like:

- "Keep it brief", "be concise", "in 1–2 sentences", "short answer",
  "limit your response to…", "respond in under N words".

**Action:** delete those clauses (or soften to "Be clear and well-organized;
give complete, actionable answers"). Do **not** add a new length cap — the code
now supplies the depth directive.

## 2. Use the real voter-file district name (`[[l2DistrictName]]`)

The code now resolves the candidate's real L2 district name and exposes it as
the `[[l2DistrictName]]` token (falling back to the self-reported district, then
to `unknown`).

**Action:**

- In **`candidateJson`**, add a field so the model receives it, e.g.:
  ```json
  "district": "[[l2DistrictName]]"
  ```
  (or add a new `"districtName": "[[l2DistrictName]]"` key).
- In **`systemPrompt`** / **`initialPrompt`**, replace generic phrasing like
  "your district" / "the district" with `[[l2DistrictName]]` where you want the
  assistant to name it explicitly, e.g.:
  > "You are advising a candidate running in [[l2DistrictName]]."

## 3. (Optional) Switch the prompt source to Markdown

The streaming path no longer post-processes HTML, and the code instructs the
model to emit **Markdown only**. If `systemPrompt` / `initialPrompt` / examples
still instruct HTML output (`<ul>`, `<a href>`, `<br>`, `<strong>`, etc.):

**Action:** rewrite those instructions/examples to Markdown
(`-` lists, `[label](https://…)` links, `**bold**`). This removes the
HTML-vs-Markdown ambiguity and is purely an editorial cleanup — the renderer and
code directive already handle Markdown, and legacy HTML history still renders.

---

## Notes / safety nets already handled in code (no CMS action needed)

- **Links:** unsafe/relative/`javascript:` links are stripped to plain text
  before the answer is saved/sent. Safe `https`, internal `goodparty.org`, and
  `mailto:`/`tel:` links are preserved.
- **Prompt injection:** role/template delimiters in user input and candidate
  context are neutralized before being sent to the model.
- **Follow-ups & title:** generated automatically after each reply.
- **Model fallback:** set `AI_FALLBACK_MODEL` (+ `ANTHROPIC_API_KEY` for a
  Claude fallback) in the API env to add a cross-provider safety net for the
  streaming chat.
