# Agent Experiments Module

gp-api's side of the PMF Engine contract. Dispatches agent experiment runs to SQS, records them in the `experiment_run` table, and reconciles results from the agent-results queue.

This module is intentionally thin — it is a **transport layer**, not a product layer. It does not know which experiments exist, what params they need, who is allowed to run them, or how artifacts are consumed. Callers own all of that; this module only moves runs through states.

## How It Works

```
caller (gp-api service)
   │
   │  ExperimentRunsService.dispatchRun({ experimentType, organizationSlug, params })
   ▼
DB: INSERT experiment_run (status=RUNNING)      SQS: agent-dispatch-{env}.fifo
                                                         │
                                                         ▼
                                                Lambda → Fargate (PMF Engine)
                                                         │
                                                         ▼
                                                S3: artifact upload
                                                         │
                                                         ▼
                                           SQS: agent-results queue
                                                         │
                                                         ▼
QueueConsumerService.handleAgentExperimentResult
   │
   │  optimistic-locking UPDATE experiment_run
   ▼
status RUNNING → COMPLETED | FAILED,  artifactKey/Bucket, durationSeconds, error
```

### Lifecycle

```
RUNNING ──► COMPLETED        (result.status = "success")
        └─► FAILED           (result.status = "failed" or "contract_violation",
                              or sweeper timeout at 45 min, or SQS dispatch error)
```

Three terminal states only. `contract_violation` at the queue boundary collapses to `FAILED` — the distinction belongs (if anywhere) in the `error` column, not the enum.

### Callback idempotency

`handleAgentExperimentResult` uses `optimisticLockingUpdate` on `updatedAt` and guards on `status === RUNNING` before patching. A duplicate result for an already-terminal run is logged and dropped.

## Files

| File                                 | Purpose                                                                |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `agentExperiments.module.ts`         | Nest module — exports `ExperimentRunsService`                          |
| `services/experimentRuns.service.ts` | `dispatchRun()`, `sweepStaleRuns()` (`@Cron`), + inherited Prisma CRUD |

No controller, no schemas, no other services. HTTP surface is a caller concern.

## SQS message shapes

**Dispatch** (gp-api → agent) — produced by `ExperimentRunsService.dispatchRun()`:

```json
{
  "run_id": "<uuid>",
  "params": { ... },
  "organization_slug": "...",
  "experiment_type": "..."
}
```

Sent to the queue named by `AGENT_DISPATCH_QUEUE_NAME` (e.g. `agent-dispatch-dev.fifo`). The URL is resolved once on first dispatch via `sqs:GetQueueUrl` and cached on the service instance. `MessageGroupId = "agent-dispatch-{organizationSlug}"` (per-org FIFO ordering), with a random `MessageDeduplicationId`.

**Result** (agent → gp-api) — consumed by `QueueConsumerService.handleAgentExperimentResult`. Schema in `src/queue/queue.types.ts` (`AgentExperimentResultSchema`):

```ts
{
  runId: string,
  status: 'success' | 'failed' | 'contract_violation',
  artifactKey?: string,
  artifactBucket?: string,
  durationSeconds?: number,
  error?: string,      // truncated to 1000 chars on write
}
```

Envelope: `{ type: QueueType.AGENT_EXPERIMENT_RESULT, data: <above> }`.

## Stale-run sweeper

`ExperimentRunsService.sweepStaleRuns` runs on `*/15 * * * *`. Any `RUNNING` run with `createdAt` older than 45 minutes is flipped to `FAILED` with a timeout-error message. Runs on every replica — safe because the `UPDATE` is idempotent.

## Data model

`experiment_run` (see `prisma/schema/experimentRun.prisma`):

- `runId` — unique, uuid7, used in SQS messages and by callers
- `organizationSlug` → `Organization.slug`, `onDelete: Cascade`
- `experimentType: String` — opaque to this module; callers define the value space
- `status: ExperimentRunStatus { RUNNING, COMPLETED, FAILED }`
- `params: Json`, `artifactBucket/Key`, `durationSeconds`, `error`
- `@@index([organizationSlug, experimentType])`

## Testing

```bash
npx vitest run src/agentExperiments/
npx vitest run src/queue/consumer/queueConsumer.service.test.ts
```

## Environment Variables

- `AGENT_DISPATCH_QUEUE_NAME` — FIFO queue name (e.g. `agent-dispatch-dev.fifo`). The URL is resolved at runtime via `GetQueueUrl` and cached.
- AWS credentials from the standard provider chain (env, IAM role, etc.)

### Preview environments

`AGENT_DISPATCH_QUEUE_NAME` is **not set** in preview envs. Dispatch fails at runtime: the DB row is flipped to `FAILED`, an error is logged, and `dispatchRun` throws `BadGatewayException`. Callers that want to exercise agent dispatch on a PR branch should merge to `develop` and test against dev. (Rationale: per-PR agent queues would require provisioning a matching consumer in `gp-ai-projects` per preview, which isn't worth the cost for a PR verification step.)
