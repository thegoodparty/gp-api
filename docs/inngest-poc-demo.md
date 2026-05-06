# Inngest POC — Demo Guide

## What This POC Does

This branch replaces the SQS-based poll creation/expansion background jobs with [Inngest](https://www.inngest.com), an event-driven background job platform. Two Inngest functions are implemented:

- **Poll Creation** (`polls/creation.requested`) — Fetches poll + campaign data, generates a CSV of sampled contacts, creates `PollIndividualMessage` records, and sends a Slack notification. Uses Inngest's `step.run()` for durable checkpointing across each phase.
- **Poll Expansion** (`polls/expansion.requested`) — Expands an existing poll's audience with additional contacts.

Both functions have automatic retries (3x) and are fully observable via the Inngest dev server UI.

## Prerequisites

- Node 22 (`nvm use`)
- Docker (for Postgres + Inngest dev server)
- A `.env` file with your usual local dev config

## Setup

### 1. Start infrastructure

```bash
docker compose up -d
```

This starts:

- **Postgres** on `localhost:5432`
- **Inngest dev server** on `localhost:8288`, configured to call back to `http://host.docker.internal:3000/v1/inngest`

### 2. Environment variables

Make sure your `.env` includes:

```
INNGEST_DEV=1
```

That's it for local dev — no event keys or signing keys needed. The Inngest dev server handles everything locally.

### 3. Install and migrate

```bash
npm install --legacy-peer-deps
npm run migrate:dev
```

### 4. Start the API

```bash
npm run start:dev
```

The API serves the Inngest webhook handler at `GET/POST /v1/inngest`.

## Running the Demo

### Open the Inngest Dashboard

Go to **http://localhost:8288** in your browser. This is the Inngest dev server UI — it shows:

- All registered functions (you should see `poll-creation` and `poll-expansion`)
- A live event stream
- Function execution details with per-step logs and timing

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

Alternatively, trigger through the webapp's poll creation flow if you have that running.

### Watch It Execute

1. Switch to the **Inngest dashboard** (`localhost:8288`)
2. You'll see a `polls/creation.requested` event appear in the stream
3. Click into the `poll-creation` function run to see each step execute:
   - `get-or-create-csv` — samples contacts, uploads CSV to S3
   - `parse-csv-and-create-messages` — creates `PollIndividualMessage` records
   - `send-slack-message` — posts to Slack with CSV attachment
4. Each step shows its duration, input/output, and retry status

### Test Retries

To see Inngest's retry behavior, you can temporarily break one of the steps (e.g., remove your `TEVYN_POLL_CSVS_BUCKET` env var) and trigger a poll. The dashboard will show the function failing and retrying up to 3 times with backoff.

### Trigger a Poll Expansion

Poll expansion is triggered when expanding an existing poll's audience. The function (`poll-expansion`) runs a single step that delegates to `PollExecutionService.executePollExpansion()`.

## Key Files

| File                                               | Purpose                                           |
| -------------------------------------------------- | ------------------------------------------------- |
| `src/inngest/inngest.client.ts`                    | Inngest client with Zod event schemas             |
| `src/inngest/inngest.controller.ts`                | Fastify route handler for Inngest webhooks        |
| `src/inngest/services/inngest.service.ts`          | Public API for sending events                     |
| `src/inngest/services/inngestFunctions.service.ts` | Function definitions (poll creation + expansion)  |
| `src/polls/services/polls.service.ts`              | Where events are dispatched on poll create/expand |
| `docker-compose.yml`                               | Inngest dev server config                         |

## Architecture

```
API Request (create poll)
    │
    ▼
PollsService.create()
    │
    ├─ Creates poll in DB
    └─ Fires inngest.send('polls/creation.requested', { pollId })
           │
           ▼
    Inngest Dev Server (localhost:8288)
           │
           ▼
    Calls back to POST /v1/inngest
           │
           ▼
    InngestController → InngestFunctionsService
           │
           ├─ step: get-or-create-csv
           ├─ step: parse-csv-and-create-messages
           └─ step: send-slack-message
```

Each `step.run()` is independently retryable — if the Slack notification fails, Inngest retries only that step, not the entire function.
