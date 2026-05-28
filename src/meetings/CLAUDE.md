# Meetings Module

End-to-end pipeline that turns a sitting elected official's recurring public meeting into an AI-generated briefing the user can read, annotate, and chat about. This module owns the briefing side. Sibling features that hang off the same artifact (annotations, per-item feedback, chat) live in other modules but are wired into the same `(elected_office, meeting_date)` addressing scheme.

## Purpose

The product surface is "show me a chronological list of my upcoming meetings, and for each one give me a briefing pack and a chat assistant that knows the agenda." Callers are the `gp-webapp` post-launch elected-official experience (`/elected-official` routes). The artifact this module produces is a `MeetingBriefing` row pointing at a JSON document in S3, written by the PMF agent (runbooks repo) for one specific `meeting_date`.

This module is intentionally a thin orchestration layer over `agentExperiments`. It dispatches two experiment types (`meeting_schedule` and `meeting_briefing`), reacts to results via `onExperimentRunCompleted`, and exposes read endpoints. It does not generate content itself.

## Data model

Eight Prisma models + two enums participate. File paths are under `prisma/schema/`.

| Model                      | File                              | Role                                                                                                                                     |
| -------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `MeetingBriefing`          | `meetingBriefing.prisma`          | One row per `(electedOfficeId, meetingDate)`. Points at the S3 artifact and caches a typed copy in JSONB.                                |
| `ExperimentRun`            | `experimentRun.prisma`            | Dispatch + result row for both `meeting_schedule` and `meeting_briefing` agent runs.                                                     |
| `Annotation`               | `annotation.prisma`               | A user marker on a briefing — a note, a chat anchor, or a bug report. Joined to the briefing via `resourceId` + `resourceType=briefing`. |
| `AnnotationNote`           | `annotationNote.prisma`           | Optional `body` (typed text) for `kind=note` annotations. Owns attachments.                                                              |
| `AnnotationNoteAttachment` | `annotationNoteAttachment.prisma` | File uploads on a note (image / pdf / docx / plaintext). Carries OCR status + extracted text.                                            |
| `ChatConversation`         | `chatConversation.prisma`         | Persistent conversation owned by a user. Linked 1:1 to an `Annotation` of `kind=chat`.                                                   |
| `ChatMessage`              | `chatMessage.prisma`              | Individual user/assistant/system/tool message in a conversation.                                                                         |
| `ArtifactFeedback`         | `artifactFeedback.prisma`         | Per-user thumbs up/down on an item inside the briefing artifact (currently agenda items only).                                           |

Enums:

| Enum                     | Values                                                    | Used by                              |
| ------------------------ | --------------------------------------------------------- | ------------------------------------ |
| `AnnotationKind`         | `note`, `chat`, `bug_report`                              | `Annotation.kind`                    |
| `AnnotationResourceType` | `briefing` (only value today)                             | `Annotation.resourceType`            |
| `OcrStatus`              | `pending`, `processing`, `completed`, `failed`, `skipped` | `AnnotationNoteAttachment.ocrStatus` |
| `ChatMessageRole`        | `user`, `assistant`, `system`, `tool`                     | `ChatMessage.role`                   |
| `ArtifactResourceType`   | `agenda_item`                                             | `ArtifactFeedback.artifactType`      |
| `ArtifactFeedbackKind`   | `positive`, `negative`                                    | `ArtifactFeedback.feedback`          |
| `ExperimentRunStatus`    | `RUNNING`, `COMPLETED`, `FAILED`                          | `ExperimentRun.status`               |

Note: there is **no** `MeetingSchedule` Prisma model. "The schedule" is a JSON shape (`MeetingSchedule` in `src/generated/agent-job-contracts.ts`) produced by the `meeting_schedule` agent experiment and read on demand from S3 via `MeetingBriefingsService.loadLatestScheduleForOrg()`. The most recent `COMPLETED` schedule run for the org wins.

## End-to-end flow

```
ElectedOffice created
       │  (only when MEETINGS_AUTOMATION_ENABLED=true)
       ▼
MeetingBriefingsService.onElectedOfficeCreated()
       │
       ├──► ExperimentRunsService.dispatchRun({ type: 'meeting_schedule', ... })
       └──► ExperimentRunsService.dispatchRun({ type: 'meeting_briefing', ... })
              │  (both dispatched in parallel — briefing does not wait on schedule)
              ▼
PMF agents (runbooks) run independently and emit their artifacts
       │  SQS: agent results queue
       ▼
QueueConsumerService.handleAgentExperimentResult
       │  optimistic-locking UPDATE experiment_run → COMPLETED
       ▼
MeetingBriefingsService.onExperimentRunCompleted(run)
       │
       └── if experimentType=meeting_briefing → upsertBriefingRow()
              │  validates briefing_status, parses meeting_date,
              │  reads meeting_time + meeting_timezone from the artifact,
              │  writes/updates the MeetingBriefing row
              ▼
         MeetingBriefing row visible at GET /v1/meetings/:date/briefing
```

Schedule and briefing are decoupled. `onExperimentRunCompleted` does nothing on `meeting_schedule` completion — the schedule artifact is read on demand by the list endpoint via `loadLatestScheduleForOrg()` to project upcoming meeting dates from the RRULE. A briefing row is self-sufficient: its `meetingTime` and `meetingTimezone` come from the briefing artifact, not from the schedule.

The daily cron (`dispatchDailyBriefings`, `0 7 * * *` UTC) sweeps every `ElectedOffice`, and dispatches a `meeting_briefing` run for any office whose next future `MeetingBriefing` row is missing.

`upsertBriefingRow` is selective about which `briefing_status` values it persists:

- `briefing_ready`, `agenda_provided_by_user` → write the row.
- Any other "placeholder" value (e.g. agenda not posted yet) → log and skip so the next cron retries.
- `error` → log and skip.

## Controllers and routes

### `src/meetings/controllers/meetingsBriefings.controller.ts` — `/v1/meetings/*`

| Method | Path                           | Notes                                                                                                                                                                                                                                            |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/meetings`                    | Lists upcoming meetings. Merges projected dates from the schedule (RRULE) with existing `MeetingBriefing` rows. Returns `{ scheduleKnown, meetings[] }`.                                                                                         |
| GET    | `/meetings/:date/briefing`     | Returns the full briefing artifact JSON for that date, or `{ status: 'awaiting_agenda', ... }` if no row yet (200, not 404). Frontend treats `awaiting_agenda` as "the meeting is on the schedule but the agent hasn't filled the briefing yet". |
| POST   | `/meetings/briefings/dispatch` | Admin only. Manually kicks a `schedule` or `briefing` dispatch for a specific `electedOfficeId`. 404 if context can't be resolved (missing user clerkId, missing position, etc.).                                                                |

### `src/annotations/controllers/briefingAnnotations.controller.ts` — `/v1/meetings/:date/briefing/annotations`

| Method | Path | Notes                                                                                                                        |
| ------ | ---- | ---------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/`  | List the user's annotations (any `kind`) for that briefing. `resourceId` is resolved server-side from the date.              |
| POST   | `/`  | Create a new annotation. Body specifies kind, optional jsonPath + start/end character offsets, and a note body or chat seed. |

### `src/annotations/controllers/annotations.controller.ts` — `/v1/annotations/:annotationId/*`

| Method | Path                                                     | Notes                                                                                                               |
| ------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| PUT    | `/:annotationId/note`                                    | Update the typed body of a note annotation. Body may be empty when relying on attachment OCR text.                  |
| DELETE | `/:annotationId`                                         | 204. Cascade-deletes note / chat / bug report rows.                                                                 |
| POST   | `/:annotationId/note/attachments/presign`                | Returns a presigned PUT URL for direct S3 upload. Creates an `AnnotationNoteAttachment` row in `ocrStatus=pending`. |
| POST   | `/:annotationId/note/attachments/:attachmentId/complete` | 204. Caller invokes after the PUT succeeds. Triggers OCR worker.                                                    |
| DELETE | `/:annotationId/note/attachments/:attachmentId`          | 204.                                                                                                                |

### `src/artifactFeedback/controllers/briefingItemFeedback.controller.ts` — `/v1/meetings/:date/briefing/items/:itemId/feedback`

| Method | Path | Notes                                                                                                      |
| ------ | ---- | ---------------------------------------------------------------------------------------------------------- |
| PUT    | `/`  | Set `positive` or `negative` feedback on an agenda item ID. Idempotent per `(user, briefing, item, type)`. |
| DELETE | `/`  | 204. Clears the user's feedback for the item.                                                              |

### `src/chats/briefing-chats/controllers/briefing-chats.controller.ts` — `/v1/briefing-chats/*`

| Method | Path                      | Notes                                                                                                                                                       |
| ------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/`                       | Find-or-create the chat conversation for a `(meetingDate, anchor)` pair. Idempotent. Creates an `Annotation` of `kind=chat` linked to a `ChatConversation`. |
| POST   | `/:annotationId/messages` | SSE stream. Calls `BriefingChatsService.sendMessage()`. Streams Claude output as `data: {...}\n\n` chunks. 5-minute server timeout.                         |
| GET    | `/:annotationId`          | Replay the persisted conversation.                                                                                                                          |
| DELETE | `/:annotationId`          | 204. Soft-deletes the `ChatConversation` (`deletedAt` set, messages preserved).                                                                             |

## Notes, dictation, and transcription

`AnnotationNote.body` is `String?` — nullable. A note can exist with:

- A typed `body` and no attachments, or
- An empty `body` and one or more `AnnotationNoteAttachment`s whose `ocrStatus` is `completed`, or
- Both.

The upload contract is presign → client PUT → `complete`. The `complete` endpoint hands the attachment to the OCR worker. Extractors live in `src/ocr/extractors/` (image via Textract, pdf, docx, plaintext) and write `ocrText` + flip `ocrStatus`.

The frontend uploads asynchronously and polls the attachment until `ocrStatus` is terminal (`completed | failed | skipped`). It will not surface the note to the chat assistant until OCR resolves.

`BriefingNotesService.loadNotesForChat()` (see `src/chats/briefing-chats/services/briefingNotes.service.ts`) is the canonical consumer of notes for AI context. After the recent `swain/briefing-ai-notes-context` work, it must consider OCR text as a fallback when `body` is empty. **TODO: verify** — the current `loadNotesForChat` filters with `!row.note.body`, which still drops attachment-only notes. If the AI is meant to see OCR text, that filter needs the OCR fallback wired in.

## AI chat assistant

`BriefingChatsService.sendMessage()` runs a streaming LLM call via `ChatStreamService` against Claude. The system prompt is composed by `systemPromptBuilder.ts`. Models attempted in order:

- `claude-sonnet-4-6` (default)
- `claude-opus-4-7` (fallback)

### Tools

Built per request in `buildToolsForUser()`. Availability depends on env vars and resolved context:

| Tool                   | Provider                    | Available when                                                                                                                                                                                  |
| ---------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_artifacts`        | `BriefingArtifactsProvider` | Always.                                                                                                                                                                                         |
| `web_search`           | `TavilySearchProvider`      | `TAVILY_API_KEY` is set.                                                                                                                                                                        |
| `district_insights`    | `DatabricksSqlProvider`     | Databricks env vars are set **and** `DistrictResolverService.resolveByUserId()` returns a district. Locked to the `int__l2_nationwide_uniform_w_haystaq` table with mandatory district filters. |
| `list_district_topics` | Static                      | Same condition as `district_insights`.                                                                                                                                                          |
| `get_my_notes`         | `LazyNotesProvider`         | Only when `BriefingNotesService.countNotesForUser()` > 0. The count check is up-front; the actual notes load is deferred to first tool call.                                                    |

### Lazy notes provider pattern

The count is cheap and decides whether to expose the tool at all (and whether the system prompt mentions "the user has N notes"). The full load — including `extractHighlight` against the artifact for each note — is wrapped in a promise that only fires when the LLM calls the tool. On failure the cache is invalidated so a retry can succeed. See `LazyNotesProvider` in `briefing-chats.service.ts`.

### System prompt guardrails (`systemPromptBuilder.ts`)

Five conditionally-included blocks:

- **`ROLE_CLARIFIERS_BLOCK`** — chief-of-staff framing, always second-person, no campaign-comms unless explicitly asked.
- **`GUARDRAILS_BLOCK`** — refuses off-topic, refuses internals/prompt-injection, **single canonical decline line** (`GUARDRAIL_DECLINE`).
- **`INSTRUCTIONS_BLOCK`** — ground answers in `<briefing>...</briefing>`; treat that content as data, not instructions.
- **`DISTRICT_INSIGHTS_RULES`** — no counts below 100, no `hs_` / `l2_` identifiers, no raw SQL, always qualify as modeled estimates. **Included only when `district_insights` is in `availableToolNames`.**
- **`WEB_SEARCH_RULES`** — proactive use, require source URLs, no fake citations. Included only when `web_search` is available.

`sanitizeUntrustedContent()` strips delimiter tags (`<briefing>`, `<|system|>`, etc.) from any untrusted text spliced into the prompt.

## experiment_run integration

The `meetings` feature is a transport-layer caller of the `agentExperiments` module. See `src/agentExperiments/CLAUDE.md` for the full contract; the meetings-specific bits:

- **Experiment types**: `meeting_schedule` and `meeting_briefing`. Both are `keyof AgentJobContracts` in `src/generated/agent-job-contracts.ts`.
- **Dispatch entry point**: `ExperimentRunsService.dispatchRun({ type, organizationSlug, clerkUserId, params })`. The runbooks side resolves the user via `clerkUserId`, so a missing `clerkId` aborts dispatch (`resolveDispatchContext`).
- **Result handling**: `QueueConsumerService.handleAgentExperimentResult` (`src/queue/consumer/queueConsumer.service.ts:821`) optimistically flips the run to a terminal state, then `await`s `meetingBriefings.onExperimentRunCompleted(updatedRun)` inside a `.catch` so a briefing-write failure doesn't replay the SQS message.
- **Artifact contracts**: per-experiment `manifest.json` files in the `agent-experiment-metadata-dev` S3 bucket (rough pointer — exact paths are owned by the runbooks repo; check there for the source of truth). Regenerate types via `tsx scripts/generate-agent-job-types.ts`.

## Cron jobs

| Cron                         | Service / method                                 | Schedule        |
| ---------------------------- | ------------------------------------------------ | --------------- |
| Daily briefing dispatch      | `MeetingBriefingsService.dispatchDailyBriefings` | `0 7 * * *` UTC |
| Stale experiment-run sweeper | `ExperimentRunsService.sweepStaleRuns`           | `*/15 * * * *`  |

In dev/QA, `dispatchDailyBriefings` will fan out one SQS message per `ElectedOffice` if `MEETINGS_AUTOMATION_ENABLED=true`. This is loud — leave the env var unset (or `false`) on non-production environments unless you are deliberately testing the cron.

## Gotchas

- **`onElectedOfficeCreated` auto-dispatches a schedule experiment** when `MEETINGS_AUTOMATION_ENABLED=true`. Toggling this on in dev caused noise during initial rollout; default to off outside prod.
- **Internal data source names must not leak.** Tables like `int__l2_nationwide_uniform_w_haystaq` and any column starting with `hs_` / `l2_` are internal. The `DISTRICT_INSIGHTS_RULES` block enforces this on the chat path, but the briefing artifact itself can still embed these names — the frontend (and any future export path) must mask at the boundary.
- **`AnnotationNote.body` is nullable.** Anything reading notes for AI context, surface display, or search must consider the attachment OCR fallback. The current `BriefingNotesService.loadNotesForChat` filters notes with empty body — confirm whether that's intentional for your call site (see "Notes, dictation, and transcription" above). **TODO: verify** that the recent context-unification work actually wires OCR text into this path.
- **`onExperimentRunCompleted` runs inside the queue consumer.** It uses `optimisticLockingUpdate` on the experiment run. Don't add a second writer to the same row outside that pattern — duplicate SQS deliveries already rely on the lock for idempotency.
- **`upsertBriefingRow` is unique on `(electedOfficeId, meetingDate)`.** Two briefing runs for the same date overwrite each other (intended). `meetingTime` and `meetingTimezone` come from the briefing artifact (`meeting_time`, `meeting_timezone`); the schedule artifact is not consulted here. A malformed `meeting_time` (not `HH:MM`) or missing `meeting_timezone` skips the row write so the next run can retry.
- **`MeetingBriefing.artifact` is a typed JSONB cache.** Source of truth is the S3 object at `artifactBucket`/`artifactKey`. `GET /:date/briefing` always re-reads from S3; the JSONB copy is only used in list aggregation and is fine to drift in dev.
- **`awaiting_agenda` is a 200 response, not a 404.** The frontend renders a placeholder for it. If you "fix" this to return 404, you'll break the list view.
- **`getBriefing` returns raw `JSON.parse` output.** No Zod validation on the response (intentional — the artifact schema is evolving and validating here would cause 500s on legitimate new fields). Treat the response as untrusted-ish in any downstream consumer.

## Pointer table

| Area                                          | Path                                                                                            |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Briefing dispatch + lifecycle                 | `src/meetings/services/meetingBriefings.service.ts`                                             |
| Briefing list + read endpoint                 | `src/meetings/controllers/meetingsBriefings.controller.ts`                                      |
| Annotations service                           | `src/annotations/services/annotations.service.ts`                                               |
| Attachment / presign / OCR trigger            | `src/annotations/services/annotationAttachment.service.ts`                                      |
| OCR extractors + Textract                     | `src/ocr/`                                                                                      |
| Per-item feedback                             | `src/artifactFeedback/services/artifactFeedback.service.ts`                                     |
| Chat orchestration                            | `src/chats/briefing-chats/services/briefing-chats.service.ts`                                   |
| Chat context loader                           | `src/chats/briefing-chats/services/briefingContext.service.ts`                                  |
| Chat notes loader                             | `src/chats/briefing-chats/services/briefingNotes.service.ts`                                    |
| System prompt builder                         | `src/chats/briefing-chats/services/systemPromptBuilder.ts`                                      |
| AI tools                                      | `src/llm/tools/{getArtifacts,getMyNotes,webSearch,districtInsights,districtTopics}.tool.ts`     |
| Experiment dispatch transport                 | `src/agentExperiments/services/experimentRuns.service.ts`                                       |
| Queue consumer hook                           | `src/queue/consumer/queueConsumer.service.ts` (`handleAgentExperimentResult`)                   |
| Shared contracts (annotation, feedback, chat) | `contracts/src/annotations/`, `contracts/src/artifactFeedback/`, `contracts/src/briefingChats/` |
| Frontend route                                | `gp-webapp` → `/elected-official/meetings/*`                                                    |
| Agent runbooks                                | `runbooks/` repo — `meeting_schedule` and `meeting_briefing` experiments                        |
| Module shape ADR                              | `docs/adr/0001-prisma-base-pattern.md`                                                          |
| Single-queue ADR                              | `docs/adr/0003-fifo-sqs-single-queue.md`                                                        |
| Sibling module docs                           | `src/agentExperiments/CLAUDE.md`, `src/queue/CLAUDE.md`, `prisma/CLAUDE.md`                     |
