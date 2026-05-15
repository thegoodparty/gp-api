# Client hookup — chat routes

How to wire a frontend (gp-webapp, or any other client) to the chat surface. The shared contract here applies to every chat kind. Per-kind routes are listed below; future kinds (campaign-strategy-chats, etc.) follow the same conventions.

## Routes

### Briefing chats — annotation-keyed

```
POST   /v1/briefing-chats/:annotationId/messages   # SSE, sends a user message
GET    /v1/briefing-chats/:annotationId            # conversation + history
DELETE /v1/briefing-chats/:annotationId            # 204 soft-delete
```

`annotationId` is the cuid of an `Annotation` row with `kind=chat` and `resourceType=briefing`. The annotation must be created (and its `chatConversationId` set) by the annotation owner's API before any chat traffic is possible. Our endpoints never lazy-create a `ChatConversation` — if the FK isn't set, you get `404 Conversation not initialized for this annotation`.

## Authentication

All routes use the standard gp-api session guard. Pass the session cookie (JWT) the way the rest of the app does. For server-to-server / testing, a Clerk M2M token works (`Authorization: Bearer mt_...`) — see `docs/adr/0004-clerk-m2m-auth.md`.

## POST `:annotationId/messages` — sending a message

Request body:

```json
{
  "content": "What's the controversy on agenda item 2?",
  "clientMessageId": "9c2d8e1f-..."
}
```

| Field | Required | Notes |
|---|---|---|
| `content` | yes | Trimmed; max 10,000 chars; empty rejected with 400 |
| `clientMessageId` | optional | UUID v4. **Strongly recommended** — see idempotency section below |

Response is **SSE** (`Content-Type: text/event-stream`). Each frame is `data: <JSON>\n\n`. The JSON shape is one of:

| Type | Fields | Meaning |
|---|---|---|
| `text` | `{ type: 'text', delta: string }` | Token-by-token assistant output. Append to a buffer. |
| `tool_call` | `{ type: 'tool_call', toolName: string, args: object }` | The LLM invoked a tool. Show "thinking" / "searching" UI if you want. |
| `tool_result` | `{ type: 'tool_result', toolName: string, result: object }` | Tool finished. |
| `done` | `{ type: 'done', assistantMessageId?: string }` | Stream complete. `assistantMessageId` may be omitted if persistence failed; don't depend on it being present. |
| `error` | `{ type: 'error', code, message, retryable }` | Stream failed. See error codes below. |

Always handle `done` and `error` as terminal — close the stream and stop reading.

### Error codes

| `code` | `retryable` | When | Suggested UI |
|---|---|---|---|
| `conversation_not_found` | false | Annotation isn't a chat / chatConversationId is null / wrong owner | "This chat is unavailable. Refresh the briefing." |
| `upstream_unavailable` | true | LLM provider 5xx / network failure | "Chat is temporarily unavailable. Retry?" + retry button |
| `rate_limited` | true | LLM provider 429 | "Too many requests. Try again in a moment." + retry |
| `aborted` | false | Client closed connection or server cancelled | Show nothing (user did it themselves). |
| `internal` | false | Anything else server-side | "Something went wrong. Please refresh." |

Always show `message` to the user — it's already sanitized server-side (no stack traces, no internal model names, no provider URLs).

## Idempotency — `clientMessageId`

**Rule: one UUID per logical send. New send → new UUID. Network retry of the same send → reuse the same UUID.**

```ts
const messageId = crypto.randomUUID()

async function send(content: string) {
  try {
    return await postMessage({ content, clientMessageId: messageId })
  } catch (err) {
    if (isRetryable(err)) {
      // reuse the same messageId — backend dedupes via partial unique index
      return await postMessage({ content, clientMessageId: messageId })
    }
    throw err
  }
}
```

What this prevents:
- **Double-click on Send** — two POSTs with the same `clientMessageId` → only one user message persisted, only one LLM stream runs. (Best UX is still to disable the Send button while the request is in flight; idempotency is a backstop.)
- **Network-retry mid-send** — client times out, retries → same id → backend returns the existing message instead of running the LLM twice.

If you omit `clientMessageId` you get the old non-idempotent behavior. Use it.

## Abort / disconnect

Pass a fetch `AbortSignal` to your request. Closing the connection (`controller.abort()`, navigating away, closing the tab) is detected server-side: the SSE generator stops, the LLM stream is cancelled, partial text is persisted, and a final `done` chunk is yielded with `code: 'aborted'` if you're still listening (you usually aren't, since you aborted).

There's also a **90-second server-side timeout** per stream. If the LLM hangs, the server forces abort on its side.

## GET `:annotationId` — load history

```json
{
  "conversationId": "ckg...",
  "messages": [
    { "id": "...", "role": "user", "content": "...", "createdAt": "2026-05-14T..." },
    { "id": "...", "role": "assistant", "content": "...", "createdAt": "..." }
  ]
}
```

Messages are ordered by `createdAt` ascending. Returns 404 if the conversation has been soft-deleted. Returns 404 (not 403) for cross-user access — no existence leak.

## DELETE `:annotationId` — soft-delete

Returns 204 No Content. Soft-deletes the underlying `ChatConversation` (sets `deletedAt`). After deletion:
- `GET` returns 404
- `POST` returns `conversation_not_found` over SSE

Soft-delete is **not reversible** through our API. If a user wants to start a fresh chat on the same highlight, the annotation owner's flow needs to delete + recreate the annotation (which mints a fresh `ChatConversation`).

## Models

The model fallback chain is `claude-sonnet-4-6` → `claude-opus-4-7`. Hardcoded in `src/chats/briefing-chats/services/briefing-chats.service.ts` (`BRIEFING_CHAT_MODELS`). Client doesn't pick the model.

## Example consumer (vanilla fetch + SSE parse)

```ts
const messageId = crypto.randomUUID()
const controller = new AbortController()

const res = await fetch(
  `/api/v1/briefing-chats/${annotationId}/messages`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, clientMessageId: messageId }),
    signal: controller.signal,
  },
)

if (!res.ok) {
  // 4xx/5xx before stream starts — read JSON body for error
  throw new Error(`HTTP ${res.status}`)
}

const reader = res.body!.getReader()
const decoder = new TextDecoder()
let buf = ''
let assistantText = ''

while (true) {
  const { value, done } = await reader.read()
  if (done) break
  buf += decoder.decode(value, { stream: true })
  // SSE frames are separated by \n\n
  const frames = buf.split('\n\n')
  buf = frames.pop() ?? ''
  for (const frame of frames) {
    if (!frame.startsWith('data: ')) continue
    const chunk = JSON.parse(frame.slice(6))
    switch (chunk.type) {
      case 'text': assistantText += chunk.delta; renderPartial(assistantText); break
      case 'tool_call': renderToolThinking(chunk.toolName); break
      case 'tool_result': /* optional, usually ignored in UI */ break
      case 'done': finalize(assistantText, chunk.assistantMessageId); return
      case 'error': showError(chunk); return
    }
  }
}
```

## Quick checklist before shipping

- [ ] Generate a fresh `clientMessageId` per send; reuse on retry
- [ ] Disable Send while a stream is in flight (don't rely on idempotency alone)
- [ ] Handle all five error codes (different UX per `retryable`)
- [ ] Wire `AbortController` to component unmount / navigation
- [ ] Treat `done` and `error` as terminal — close the reader
- [ ] Auto-scroll on `text` chunks but only if the user is at the bottom (standard chat pattern)
