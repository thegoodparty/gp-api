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

## Failure modes — what breaks if you get this wrong

These are the SQS-specific failure modes that PR review has caught repeatedly. Each one has caused or nearly caused a real production bug.

- **Stub handler that returns `true` for an unhandled `QueueType` silently drops the message.** SQS acks, nothing reaches the DLQ, no alert fires. A new `QueueType` enum value must land with a real handler case in the same PR — not a placeholder that returns success. If a placeholder is genuinely needed, return `false` (or throw a typed sentinel) so the message ages out to DLQ instead of disappearing.
- **`throw` from inside a handler triggers infinite redelivery, not DLQ.** An unhandled exception bubbles up to SQS, which treats it as transient and requeues the message. The message will redeliver until the queue's redrive policy gives up — potentially hours of retry traffic. Use the framework's failure-return path so the message reaches DLQ on max retries.
- **`enqueue` / `sendMessage` defaults to `throwOnError: false`.** Producer-side failures swallow silently. The DB row commits, the async work never runs, nothing alerts. Either pass `throwOnError: true` for callers that need fail-fast, or check the return value and decide what to do — don't assume success.
- **Credentials in payloads persist at rest.** Don't include `*_token`, `*_url` fields that carry credentials, or Clerk actor-token URLs in `data`. SQS retains messages for the queue's retention window, and the ReceiveMessage IAM scope is coarse. Pass a stable identifier (user ID, campaign ID, request ID); mint the credential in the handler from that identifier.
- **Over-broad `MessageGroupId` serializes unrelated work.** A constant or too-coarse group key (e.g. the literal string `"global"`) makes the queue effectively single-threaded for that type. A too-narrow group breaks the ordering you actually need. Pick the smallest key that preserves required ordering — typically per-campaign or per-organization, not per-app.
- **Transactional state and enqueue must agree on success.** If you commit a DB row that says "queued" and then `enqueue` fails, the row is wrong. If you `enqueue` first and then the DB commit fails, the handler runs against missing state. Enqueue inside the transaction's success path (after `await tx.commit()`-equivalent), or use an outbox pattern. Don't pretend the two-phase problem isn't there.
