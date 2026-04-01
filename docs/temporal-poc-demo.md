# Temporal POC — Demo Guide

## What This POC Does

This branch replaces the SQS-based poll creation/expansion background jobs with [Temporal](https://temporal.io), a durable execution platform. Two workflows are implemented:

- **Poll Creation Workflow** (`pollCreationWorkflow`) — Fetches poll + campaign data, generates a CSV of sampled contacts, creates `PollIndividualMessage` records, and sends a Slack notification. Each phase is a separate Temporal activity with independent retries.
- **Poll Expansion Workflow** (`pollExpansionWorkflow`) — Expands an existing poll's audience with additional contacts.

Both workflows have automatic retries (3x per activity) and are observable via the Temporal Web UI.

## Key Concepts

Temporal separates concerns into:

- **Workflows**: Orchestration logic (deterministic, durable). Defined in `workflows/poll.workflows.ts`.
- **Activities**: Side-effecting work (DB calls, S3, Slack). Defined in `activities/poll.activities.ts`.
- **Worker**: A process that polls the Temporal server for tasks and executes workflows/activities. Runs in-process via `TemporalWorkerService`.
- **Client**: Used to start workflows. Injected via `TemporalService`.

If the worker crashes mid-workflow, Temporal replays the workflow from its last checkpoint when the worker restarts — no data loss, no duplicate side effects.

## Prerequisites

- Node 22 (`nvm use`)
- Docker (for Postgres, Temporal server, and Temporal UI)
- A `.env` file with your usual local dev config

## Setup

### 1. Start infrastructure

```bash
docker compose up -d
```

This starts:

- **Postgres** on `localhost:5432`
- **Temporal server** on `localhost:7233` (uses the same Postgres instance)
- **Temporal Web UI** on `localhost:8233`

Note: The Temporal server takes ~15-30 seconds to fully initialize on first start. Watch `docker compose logs temporal` until you see "Temporal server started".

### 2. Environment variables

Make sure your `.env` includes:

```
TEMPORAL_ADDRESS=localhost:7233
```

That's it — the Temporal dev server needs no auth tokens.

### 3. Install and migrate

```bash
npm install --legacy-peer-deps
npm run migrate:dev
```

### 4. Start the API

```bash
npm run start:dev
```

The API starts an embedded Temporal worker that listens on the `gp-api-polls` task queue. You'll see a log line: `Temporal worker started on task queue: gp-api-polls`.

## Running the Demo

### Open the Temporal Web UI

Go to **http://localhost:8233** in your browser. This shows:

- All workflow executions (running, completed, failed)
- Per-workflow event history with full activity details
- Ability to query, signal, and terminate workflows

### Trigger a Poll Creation

Create a poll via the API (requires an authenticated session with a campaign that has an elected office):

```bash
curl -X POST http://localhost:3000/v1/polls \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-auth-cookie>" \
  -d '{
    "electedOfficeId": "<elected-office-id>",
    "messageContent": "Test poll message",
    "scheduledDate": "2026-04-15T12:00:00Z",
    "targetAudienceSize": 100,
    "confidence": "NINETY_FIVE",
    "imageUrl": null
  }'
```

### Watch It Execute

1. Switch to the **Temporal Web UI** (`localhost:8233`)
2. You'll see a workflow named `poll-creation-<pollId>` in the list
3. Click into it to see the event history:
   - `WorkflowExecutionStarted`
   - `ActivityTaskScheduled` → `ActivityTaskCompleted` for `getOrCreateCsv`
   - `ActivityTaskScheduled` → `ActivityTaskCompleted` for `createPollMessages`
   - `ActivityTaskScheduled` → `ActivityTaskCompleted` for `sendSlackNotification`
   - `WorkflowExecutionCompleted`
4. Each activity shows its input, output, duration, and retry count

### Test Retries and Durability

**Activity retry**: Remove your `TEVYN_POLL_CSVS_BUCKET` env var and trigger a poll. The `getOrCreateCsv` activity will fail and retry up to 3 times. The UI shows each attempt with the error message.

**Workflow durability**: Start a poll creation, then kill the API process (`Ctrl+C`) mid-execution. Restart the API — the Temporal worker will pick up the workflow from where it left off. Already-completed activities won't re-execute.

### Trigger a Poll Expansion

Poll expansion is triggered when expanding an existing poll's audience. The workflow (`pollExpansionWorkflow`) runs a single activity that delegates to `PollExecutionService.executePollExpansion()`.

## Key Files

| File                                              | Purpose                                           |
| ------------------------------------------------- | ------------------------------------------------- |
| `src/temporal/temporal.client.ts`                 | Temporal client + task queue config               |
| `src/temporal/workflows/poll.workflows.ts`        | Workflow definitions (orchestration)              |
| `src/temporal/activities/poll.activities.ts`      | Activity implementations (side effects)           |
| `src/temporal/services/temporal.service.ts`       | Public API for starting workflows                 |
| `src/temporal/services/temporalWorker.service.ts` | In-process worker that executes workflows         |
| `src/temporal/temporal.module.ts`                 | NestJS module wiring                              |
| `src/polls/services/polls.service.ts`             | Where workflows are started on poll create/expand |
| `docker-compose.yml`                              | Temporal server + UI config                       |

## Architecture

```
API Request (create poll)
    │
    ▼
PollsService.create()
    │
    ├─ Creates poll in DB
    └─ temporalService.startPollCreation(pollId)
           │
           ▼
    Temporal Server (localhost:7233)
           │
           ▼
    TemporalWorkerService (in-process)
           │
           ▼
    pollCreationWorkflow(pollId)
           │
           ├─ activity: getOrCreateCsv(pollId)
           ├─ activity: createPollMessages(pollId, csv)
           └─ activity: sendSlackNotification(pollId, csv, false)
```

Each activity runs independently. If `sendSlackNotification` fails, only that activity retries — `getOrCreateCsv` and `createPollMessages` results are already persisted in Temporal's event history.
