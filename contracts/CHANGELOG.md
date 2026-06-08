# @goodparty_org/contracts

## 0.14.0

### Minor Changes

- Add top-level `primaryResult` (`'won' | 'lost'`, nullable) to `CampaignSchema`
  / `ReadCampaignOutput`. Persists a candidate's primary-election outcome as a
  proper campaign column instead of the `details` JSON blob, so the dashboard's
  Election Results selection survives reloads. Readers can access
  `campaign.primaryResult` directly.

- Add agent-runs admin read shapes backing the gp-admin agent-runs dashboard:
  `AgentRunListItemSchema` / `AgentRunListItem` (a list row with a candidate
  summary derived from `compliance_setup` params), `AgentRunsListQuerySchema` /
  `AgentRunsListQuery` (list filters: experimentType, status, organizationSlug,
  createdAfter, createdBefore, plus pagination), `AgentRunSchema` / `AgentRun`
  (the full `experiment_run` row), and `AgentRunDetailSchema` / `AgentRunDetail`
  (`{ run, artifact, conversationLog }`, where `artifact` is an opaque
  `Record<string, unknown>` read from S3 and `conversationLog` is plain text).
  Also export the `ExperimentRunStatus` enum (`ExperimentRunStatusSchema` /
  `EXPERIMENT_RUN_STATUS_VALUES`).

- `RaceTargetMetricsSchema` / `RaceTargetMetrics` gain three nullable
  filing-office-contact fields, sourced from BallotReady via election-api's
  `/races/by-br-hash-id/:hash/filing-fee` lookup:
  - `filingOfficeAddress` — free-text address block (line 1/2, city, state, zip)
    where candidacy paperwork is submitted.
  - `filingPhoneNumber` — phone for the local election authority.
  - `paperworkInstructions` — BallotReady's narrative on the local election
    authority a candidate contacts for filing procedures.

  All `null` when BallotReady has no office data for the race. Powers the
  "filing office" block on the Pro-upgrade filing-instructions screen
  (ENG-10325). Additive and non-breaking — existing consumers are unaffected.

- Add `AWAITING_RESUME` to the `ExperimentRunStatus` enum
  (`ExperimentRunStatusSchema` / `EXPERIMENT_RUN_STATUS_VALUES`) and four fields to
  the agent-run read shapes (`AgentRunListItemSchema` / `AgentRunSchema`):
  `stage`, `dataQuality`, `resumeScheduledFor`, and `resumeAttempts`. These back
  the compliance recovery loop (ENG-7554) — a parked run is now reported as
  `AWAITING_RESUME` rather than `COMPLETED`, with its resume schedule and attempt
  count surfaced for the gp-admin dashboard.

- Add speech (Text-to-Speech and Speech-to-Text) module schemas.

  The speech module is a domain-agnostic "pure pipe": TTS in/out is plain text and audio URLs; STT in/out is audio frames and transcripts. Domain rendering and persistence are the caller's responsibility.
  - `SynthesizeSpeechRequestSchema` / `SynthesizeSpeechResponseSchema` — TTS request/response for `POST /v1/speech/synthesize`. Request is `{ text, options? }`.
  - `SYNTHESIZE_SPEECH_MAX_TEXT_LENGTH` — server-enforced cap on a single synthesis request.
  - `SpeechSynthesisVoiceSchema` — allowlist of supported Polly neural voices.
  - `SpeechSynthesisEngineSchema` — Polly engine enum.
  - `TranscribeSessionRequestSchema` / `TranscribeSessionResponseSchema` — STT WebSocket session request/response for `POST /v1/speech/transcribe/session`. Request body is reserved as `{}` for forward-compatible options.

- Widen `CampaignDetails.isProUpdatedAt` from `number` to `string | number`.
  New writes from `gp-api` store an ISO datetime string; legacy unix-ms
  numbers persist in existing rows until backfilled. Readers must handle
  both shapes. The previously-valid `number` shape is unchanged.

## 0.13.0

### Minor Changes

- `AnnotationKind` gains a `review` value for admin QA review comments.
  `Annotation` gains an optional `review` block (`id`, `body`,
  `reviewer_email`, timestamps); `reviewer_clerk_sub` is intentionally
  not exposed. `CreateAnnotationRequest` gains a `review` variant
  (`{ kind: 'review', anchor, payload: { body } }`). Review annotations
  are admin-only: creatable only inside an impersonation session and
  withheld from non-impersonated callers by a server-side default-deny.
  Additive and non-breaking for existing `note` / `bug_report` / `chat`
  consumers.

## 0.12.0

### Minor Changes

- `CommunityEventSchema` gains a required `address: string | null` field
  for the venue's physical street address (renders in Section 7's
  Address column on the campaign-plan template). `null` when the BR
  search results don't surface an address. Previously this column was
  populated from the optional `url` field — a misuse that's now
  corrected. Non-breaking: existing `url` field is unchanged; consumers
  that read `url` continue to work; new `address` is additive.

## 0.11.0

### Minor Changes

- Add `CommunityEventSchema`, `CommunityEventsResultSchema`,
  `CommunityEventsReadySchema`, `CommunityEventsGeneratingSchema`, and
  `CommunityEventsResponseSchema` plus inferred types `CommunityEvent`,
  `CommunityEventsResult`, `CommunityEventsResponse`. Backs the new
  `POST /v1/campaignStrategy/mine/community-events` polling endpoint
  that drives Section 7 of the campaign-plan template. Capped at 3
  events per the ClickUp template spec; empty array means
  "no qualifying events found" (UI shows the empty state without
  re-polling).

## 0.10.0

### Minor Changes

- Add `MilestoneWindowSchema`, `RaceMilestonesSchema`, and a new optional
  `milestones` field on `RaceTargetMetricsSchema`. Carries per-category
  campaign-timeline windows (voter registration, early voting, absentee
  ballot request) sourced live from BallotReady via gp-api. Each
  category window has nullable `start` (earliest OPEN milestone) and
  `end` (latest CLOSE milestone). The whole `milestones` object is
  nullable when the BR upstream call fails. Drives Section 6 of the
  Campaign Plan template in gp-webapp.
- Also re-export `RaceCandidateSchema` (already used by
  `RaceTargetMetricsSchema`; export was previously omitted).

## 0.9.0

### Minor Changes

- `ArtifactFeedbackSchema` and `SetArtifactFeedbackRequestSchema` now carry
  an optional `comment` string (max 2000 chars, nullable). Backs the
  thumbs-down "tell us why" composer on agenda items. Comment is omitted
  from PUT bodies that don't set it; `null` clears a previously-set
  comment. The response and the GET-list endpoint echo the stored value
  so clients can rehydrate the composer with the user's last comment.

## 0.8.0

### Minor Changes

- Add `AttachmentDownloadUrlResponseSchema` /
  `AttachmentDownloadUrlResponse`. Backs a new
  `GET /v1/annotations/:annotationId/note/attachments/:attachmentId/download-url`
  endpoint that returns a short-lived presigned S3 GET URL plus an ISO
  `expires_at`. Clients render image attachments via `<img src>` and open
  document attachments in a new tab against this URL; bytes never pass
  through gp-api.

## 0.7.0

### Minor Changes

- `AnnotationAnchorSchema` now accepts a third valid shape — **card-level**:
  `json_path` set, `start` and `end` both `null`. The annotation is scoped
  to a whole node (e.g. an agenda item card) without a passage selection.
  The previously-valid shapes — fully passage-anchored (all three set) and
  briefing-wide (all three `null`) — are unchanged. The inverse combination
  (offsets without a `json_path`) is still rejected. Updated refine message
  reflects the three valid shapes.

## 0.6.0

### Minor Changes

- Add `'generative'` to `SpeechSynthesisEngineSchema` and `'Amy'` to
  `SpeechSynthesisVoiceSchema`. Export `GENERATIVE_VOICE_VALUES` — the
  subset of voices that support the generative engine (`Joanna`, `Matthew`,
  `Salli`, `Ruth`, `Stephen`, `Amy`). Update default voice/engine from
  `Joanna`/`neural` to `Amy`/`generative`. Add a cross-field refine to
  `SynthesizeSpeechRequestSchema` that rejects any `voiceId` × `engine:
'generative'` pairing where the voice is not in `GENERATIVE_VOICE_VALUES`.

## 0.5.0

### Minor Changes

- Add annotations contracts (`AnnotationKindSchema`,
  `AnnotationAnchorSchema`, `CreateAnnotationRequestSchema`,
  `UpdateNoteRequestSchema`, `AnnotationSchema`,
  `AnnotationResponseSchema`, `AnnotationsListResponseSchema`) and
  their inferred types. Backs the briefing annotations endpoints
  (`/v1/meeting-briefings/:briefingId/annotations`,
  `/v1/annotations/:annotationId`). Snake_case at the API boundary.
  Anchor allows all-set or all-null for top-level annotations;
  `CreateAnnotationRequest` is a discriminated union on `kind`
  (`note` and `bug_report` only; `chat` is reserved).

## 0.4.0

### Breaking Changes

- Remove the meetings module schemas added in 0.3.0
  (`MeetingScheduleArtifact`, `MeetingsListResponse`,
  `MeetingBriefingResponse`). The corresponding gp-api endpoints
  (`GET /v1/meetings`, `GET /v1/meetings/:date/briefing`) no longer
  wrap their responses in Zod validation — they pass through the
  agent's camelCase artifact and return a typed camelCase object
  from the controller respectively. Consumers that imported these
  schemas should remove the imports and rely on their own types.

## 0.3.0

### Minor Changes

- Add meetings module schemas for the Meeting Briefings V2 feature
  (`MeetingScheduleArtifact`, `MeetingsListResponse`, `MeetingBriefingResponse`)
  and their inferred types. Snake_case throughout to match the raw S3 artifact
  shape — no transform layer.
- Add enriched campaign response schemas for M2M campaign endpoints.
  - `RaceTargetMetricsSchema` / `RaceTargetMetrics` — live race-target metrics shape (`winNumber`, `voterContactGoal`, `projectedTurnout`).
  - `CampaignWithPositionNameSchema` / `CampaignWithPositionName` — `ReadCampaignOutput` extended with `positionName`. Used by `GET /v1/campaigns/list` (M2M) so admins can render the human-readable position without a per-row roundtrip.
  - `CampaignWithLiveContextSchema` / `CampaignWithLiveContext` — `CampaignWithPositionName` further extended with `raceTargetMetrics` (nullable). Used by `GET /v1/campaigns/:id` (M2M).

  These centralize the shapes that `gp-api` returns and `gp-sdk` consumes, replacing the previously duplicated local definitions in both repos.

### Patch Changes

- Add optional `isPro` to `ListUsersPagination` for filtering users by pro campaign status.

## 0.2.0

### Minor Changes

- Add SetDistrictOutput response schema and type for campaign district update endpoint

## 0.1.0

### Minor Changes

- Add Campaigns module schemas, UpdateUserInput schema, PaginationOptions schema, and CI path-based publish guard.
  - Add Campaign Zod schema, ReadCampaignOutput, ListCampaignsPagination, UpdateCampaignM2M schemas
  - Add non-Prisma campaign enums (BallotReadyPositionLevel, ElectionLevel, CampaignLaunchStatus, etc.)
  - Add Campaign JSON column types (CampaignDetails, CampaignData, CampaignAiContent and sub-types)
  - Add UpdateUserInput schema derived from CreateUserInput
  - Add UserMetaData inferred type export
  - Add PaginationOptions schema for generic sortable pagination
  - Generate Campaign scalar fields from Prisma DMMF for sort key derivation
  - Guard RC and stable publish steps with dorny/paths-filter to only publish when contracts source files change
  - Delete redundant gp-api wrapper schema files that only re-exported from contracts
  - Wire all gp-api consumers to import directly from @goodparty_org/contracts

- Add Ecanvasser module Zod schemas, inferred types, and SurveyStatus enum.
  - Add CreateEcanvasserInput and UpdateEcanvasserInput schemas
  - Add CreateSurveyInput and UpdateSurveyInput schemas with SurveyStatus enum
  - Add CreateSurveyQuestionInput and UpdateSurveyQuestionInput schemas
  - Add SurveyStatus enum (`Live`, `Not Live`) and SurveyStatusSchema

- Add Ecanvasser achemas and types.
  - Add Ecanvasser and EcanvasserSummary response types

- Initial release of shared contracts package. Extracts Zod schemas and inferred TypeScript types from gp-api for consumption by gp-sdk and other projects.

  Includes:
  - Prisma DMMF enum codegen (all 16 enums)
  - Shared schemas: Email, Phone, Zip, Password, Roles, Pagination
  - Users module schemas: CreateUserInput, ReadUserOutput, UserMetaData, UpdatePassword, ListUsersPagination
  - ZodResponseInterceptor for runtime response validation in gp-api controllers

### Patch Changes

- Use default imports for CJS-only `validator` package to fix ESM interop in consumer test runners
  - Switch `import { isMobilePhone } from 'validator'` to `import validator from 'validator'` in PhoneSchema
  - Switch `import { isPostalCode } from 'validator'` to `import validator from 'validator'` in ZipSchema
  - Add const enum objects for campaign enums (CampaignCreatedBy, OnboardingStep, etc.) with declaration merging
  - Add CampaignStatus enum to contracts
  - Export campaign enums as both type and value from contracts index
  - Fix CI change detection to compare full PR diff against base branch
  - Update RC version naming to include PR number or branch name

- Add RC publish workflow and OIDC Trusted Publisher support for automated npm publishing.
  - Non-master builds (PRs, develop, qa) publish RC versions via `changeset version --snapshot rc` + `changeset publish --tag rc`
  - Master builds publish stable versions via `changesets/action`
  - RC publish is guarded: only runs when changeset files are present (contracts actually changed)
  - PR builds get a comment with the published RC version and install command
  - Uses npm OIDC Trusted Publishing (no NPM_TOKEN needed), matching the gp-sdk pattern
  - Added `registry-url` to `setup-node` for OIDC auth
