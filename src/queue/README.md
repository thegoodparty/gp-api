# `src/queue/`

Single FIFO SQS queue with producer/consumer split.

- `producer/` — anywhere in the app that needs to enqueue a message goes through here
- `consumer/queueConsumer.service.ts` — switches on `QueueType` enum to dispatch handlers (large file; future refactor will split per-handler)
- `queue.types.ts` — `QueueType` enum and per-type message shapes
- `queue.config.ts` — SQS client config

The `QueueConsumerModule` is excluded when `NODE_ENV === 'test'`.

ADR: `docs/adr/0003-fifo-sqs-single-queue.md`.
