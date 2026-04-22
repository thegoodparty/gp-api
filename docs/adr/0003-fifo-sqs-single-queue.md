# 0003 — Single FIFO SQS queue with switch dispatch

Status: accepted (with known cost)

## Context

We have several async workloads: AI content generation, path-to-victory builds, TCR compliance status checks, domain email forwarding, poll lifecycle. Options:

1. One queue per workload (per-handler isolation, more infra)
2. One FIFO queue with a typed `QueueType` enum and a switch dispatcher (simple infra, single backpressure surface)
3. Inngest / LocalStack / temporal (managed durable workflow service)

## Decision

One FIFO SQS queue. Producer in `src/queue/producer/`. Consumer in `src/queue/consumer/queueConsumer.service.ts` switches on `QueueType` to dispatch to the appropriate handler.

## Consequences

- Single ECS service runs the consumer; no per-handler scaling.
- All handlers compete for the same throughput budget.
- The consumer file is large (~1100 lines as of writing). A future refactor will split per-`QueueType` handler under `src/queue/consumer/handlers/<type>.handler.ts` with a registry map.
- The QueueConsumerModule is excluded when `NODE_ENV === 'test'`.

## Future direction

Inngest is on the radar (see `src/app.module.ts` comments). Adopting it means giving up SQS as the durable substrate. That's a bigger architectural decision — out of scope here.
