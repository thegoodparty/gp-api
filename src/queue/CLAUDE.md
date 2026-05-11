# Queue Module

Single FIFO SQS queue with a strict producer/consumer split. Anything that needs async work goes through here.

The architecture is fixed: **one queue, switch on `QueueType` enum.** Don't create a new queue for a new message type — add a `QueueType` enum value and a handler. ADR: `docs/adr/0003-fifo-sqs-single-queue.md`.

A short overview also lives in `README.md`.

## Key files

| Path                                   | Purpose                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| `queue.types.ts`                       | `QueueType` enum + per-type message data shapes (`QueueMessage` discriminated union) |
| `queue.config.ts`                      | SQS client config (region, queue URL resolution)                                     |
| `producer/queueProducer.module.ts`     | Module imported by anyone enqueuing messages                                         |
| `producer/queueProducer.service.ts`    | `enqueue(message: QueueMessage)` — single entry point for sending                    |
| `producer/queueProducer.controller.ts` | Internal-only endpoint for re-driving messages                                       |
| `consumer/queueConsumer.module.ts`     | Excluded when `NODE_ENV === 'test'`                                                  |
| `consumer/queueConsumer.service.ts`    | Polls SQS, switches on `QueueType` to dispatch handlers                              |
| `consumer/fixtures/`                   | Sample SQS payloads for tests                                                        |

## Patterns

- **Adding a new async job** = three steps: (1) add a `QueueType` enum value + data shape in `queue.types.ts`, (2) call `queueProducer.enqueue({ type, data })` from the originating module, (3) add a case in `queueConsumer.service.ts` that calls a handler defined in the owning feature module (e.g. `CampaignsService.handleWeeklyTasksDigest`). The consumer should not contain business logic — it dispatches.
- **`MessageGroupId` enforces FIFO ordering** per logical key (e.g. `agent-dispatch-{organizationSlug}`). Pick a group that gives you the ordering you actually need; over-broad groups serialize the queue.
- **Idempotency is the producer/handler's job.** SQS can redeliver. Consumer handlers use `optimisticLockingUpdate` or status guards to drop duplicates (see `agentExperiments` module for the canonical pattern).
- **Import `QueueProducerModule` wherever you enqueue.** Feature modules should depend on the producer side only; never import `QueueConsumerModule` from feature code.

## Gotchas

- `QueueConsumerModule` is excluded under `NODE_ENV === 'test'` — integration tests that need consumer behaviour must call `handle*` methods directly, not through SQS.
- The consumer file is intentionally large and switch-based; future refactor will split per-handler. Don't restructure it as part of an unrelated change (Rule 5).
- AWS credentials are required even in dev (the producer constructor throws otherwise). Set `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in `.env` for local work.
- Preview environments do **not** set `AGENT_DISPATCH_QUEUE_NAME` — agent dispatch fails fast on PR branches by design.
