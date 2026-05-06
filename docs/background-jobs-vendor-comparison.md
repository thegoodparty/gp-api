# Background Jobs Vendor Comparison

## Context

We're replacing our monolith SQS setup. The two core problems:

1. **Head-of-line blocking**: We have a static consumer reading from a single SQS queue. Any long-running job (poll creation, CSV generation, task generation) can block everything behind it. This doesn't scale, and is already causing problems today.

2. **Poor DX**: Raw SQS lacks durability, resumability, visibility, and easy manual retryability. Adding these "table stakes" features manually is a losing proposition.

We evaluated three platforms by building POCs (Inngest and Temporal) and researching a third leader in the space (Trigger.dev v3).

## The Candidates

|                          | Inngest                      | Temporal                           | Trigger.dev v3                       |
| ------------------------ | ---------------------------- | ---------------------------------- | ------------------------------------ |
| **Model**                | Event-driven step functions  | Durable workflow execution         | Managed task queue                   |
| **Where your code runs** | Your infra (ECS)             | Your infra (workers on ECS)        | Their infra (or self-hosted workers) |
| **Founded**              | 2022                         | 2019 (Uber Cadence lineage)        | 2023 (v3 shipped 2024)               |
| **GitHub stars**         | ~5K                          | ~12K+                              | ~10K                                 |
| **Language support**     | TypeScript (primary), Python | Go, Java, TypeScript, Python, .NET | TypeScript only                      |
| **License**              | Apache 2.0                   | MIT                                | Apache 2.0                           |

## How Each Solves Our Problems

### Problem 1: Head-of-Line Blocking

**Inngest**: Each function invocation is independent. Long-running work is broken into steps, each executed as a separate HTTP callback to your server. Built-in concurrency controls let you limit per-function or per-key parallelism. No shared queue to clog.

**Temporal**: Workflows execute on workers that poll from task queues. You can define multiple task queues with separate worker pools, so slow workflows don't block fast ones. Worker scaling is manual (you manage ECS task count) but gives fine-grained control.

**Trigger.dev**: Each task runs in its own container. Concurrency controls are per-task-type. No shared queue — tasks are isolated by definition. Similar to Inngest but the execution happens on their infra.

**Verdict**: All three solve this. Inngest and Trigger.dev solve it with zero configuration. Temporal requires you to design your task queue topology and worker scaling.

### Problem 2: DX (Durability, Resumability, Visibility, Retryability)

**Inngest**:

- Durability: Each `step.run()` result is persisted. If a function fails at step 3, it resumes from step 3.
- Resumability: Built-in. Steps are checkpoints.
- Visibility: Web dashboard shows live event stream, function executions, per-step timing/logs/errors.
- Retryability: Per-function retry config. Failed steps retry individually. One-click replay from dashboard.

**Temporal**:

- Durability: Gold standard. Full workflow event history persisted. Workflows survive worker crashes, deploys, infrastructure failures.
- Resumability: Automatic. Worker restarts replay the workflow from event history — already-completed activities skip re-execution.
- Visibility: Temporal UI shows workflow list, event history, activity details. Can query/signal/terminate workflows from UI.
- Retryability: Per-activity retry policies (max attempts, backoff, timeout). Built-in dead letter / failure handling patterns.

**Trigger.dev**:

- Durability: Task-level only. If a task fails mid-execution, it retries from the **beginning** (no step-level checkpointing unless you manually implement it).
- Resumability: No built-in step-level resumability.
- Visibility: Dashboard shows task runs, logs, status. Clean UI.
- Retryability: Per-task retry config with backoff.

**Verdict**: Temporal > Inngest > Trigger.dev for durability/resumability. Inngest and Temporal both offer step-level durability. Trigger.dev is a better SQS but not a durable execution platform.

## Detailed Comparison

### Integration with Our Stack (NestJS on ECS Fargate)

**Inngest**: You expose a single HTTP endpoint (`/inngest`) in your NestJS app. Inngest's cloud server calls this endpoint to execute each function step. Works naturally with ECS behind an ALB. No additional infrastructure to run. POC: ~150 lines of new code.

**Temporal**: You run Temporal workers in your NestJS process (or as separate ECS tasks). Workers long-poll the Temporal server for work. Requires a Temporal server — either Temporal Cloud (managed) or self-hosted (Postgres + Temporal server containers). POC: ~200 lines of new code + docker-compose additions. Workflow code runs in a V8 sandbox (no arbitrary Node.js APIs — takes some getting used to).

**Trigger.dev**: Task definitions live in a separate `trigger/` directory. You trigger tasks from NestJS via the SDK. Tasks execute on Trigger.dev's infra, which means your code + secrets are deployed to their platform. Self-hosted workers option exists but adds ops burden.

### Operational Burden

|                     | Inngest Cloud            | Temporal Cloud        | Temporal Self-Hosted           | Trigger.dev Cloud    |
| ------------------- | ------------------------ | --------------------- | ------------------------------ | -------------------- |
| **Infra to manage** | None (just your app)     | Workers on ECS        | Temporal Server + DB + Workers | None (just your app) |
| **Scaling**         | Automatic                | Manual (worker count) | Manual (everything)            | Automatic            |
| **Deploys**         | Deploy your app normally | Deploy app + workers  | Deploy everything              | Deploy tasks via CLI |
| **On-call burden**  | Low                      | Low-Medium            | High                           | Low                  |

### Pricing (estimated for our scale)

Assuming ~50K function/workflow runs per month:

| Tier               | Inngest                  | Temporal Cloud                                    | Trigger.dev                       |
| ------------------ | ------------------------ | ------------------------------------------------- | --------------------------------- |
| **Free**           | 25K runs/mo              | 25K actions/mo                                    | 50K runs/mo                       |
| **Paid estimate**  | ~$50-100/mo              | ~$80-200/mo                                       | ~$30-100/mo                       |
| **Cost driver**    | # of steps executed      | # of actions (starts, activities, signals)        | Compute time (they run your code) |
| **Self-host cost** | Infra for Go binary + DB | Infra for Temporal Server + DB + visibility store | Infra for platform + DB           |

### Feature Matrix

| Feature               | Inngest                     | Temporal                     | Trigger.dev v3             |
| --------------------- | --------------------------- | ---------------------------- | -------------------------- |
| Step-level durability | Yes                         | Yes                          | No                         |
| Automatic retries     | Yes (per-step)              | Yes (per-activity)           | Yes (per-task, from start) |
| Concurrency controls  | Yes (per-function, per-key) | Yes (per-task-queue)         | Yes (per-task)             |
| Cron/scheduling       | Built-in                    | Built-in                     | Built-in                   |
| Fan-out/fan-in        | Yes                         | Yes (child workflows)        | Yes (batch trigger)        |
| Rate limiting         | Yes                         | Manual (via activity design) | Yes                        |
| Debouncing            | Yes                         | Manual                       | No                         |
| Long-running (>5min)  | Per-step limit; chain steps | Unlimited                    | Up to 24h+                 |
| Signals/queries       | No                          | Yes                          | No                         |
| Compensation/sagas    | Manual                      | Native pattern               | Manual                     |
| Multi-language        | TS, Python                  | Go, Java, TS, Python, .NET   | TS only                    |
| Local dev experience  | Excellent (dev server)      | Good (docker-compose)        | Good (CLI dev mode)        |
| Web UI                | Good                        | Excellent                    | Good                       |

### Security Posture

**Inngest Cloud**: Your code stays on your infra. Inngest only sees event payloads (which you control) and orchestration metadata. Signing keys verify webhook authenticity.

**Temporal Cloud**: Your code stays on your infra (workers). Temporal sees workflow metadata and activity inputs/outputs (encrypted payloads option available). mTLS for worker connections.

**Trigger.dev Cloud**: Your code AND secrets are deployed to their infra. This may be a concern depending on compliance requirements. Self-hosted workers mitigate this.

## Recommendation

**For our team and problems: Inngest.**

Here's why:

1. **Lowest operational burden**: No infrastructure to run. No workers to manage. Deploy our NestJS app and go. This matters a lot for a small team.

2. **Step-level durability solves head-of-line blocking by design**: Breaking work into steps means each step is a short HTTP call. Long-running poll CSV generation becomes 3 independent steps that don't block anything.

3. **Code stays on our infra**: Unlike Trigger.dev, we don't send code or secrets to a third party. The Inngest server only orchestrates.

4. **DX is excellent**: The SDK is TypeScript-first, the local dev server is fast, the dashboard shows exactly what's happening. The learning curve is minimal — our team could be productive in a day.

5. **Escape hatch exists**: Inngest is open-source and self-hostable if we ever need to leave the cloud offering.

**When to reconsider Temporal**: If our workflows become genuinely complex — multi-day sagas with compensation, human-in-the-loop approvals, cross-service orchestration with signals and queries. Temporal is the most powerful option but we don't need that power today, and the operational/learning curve cost isn't worth it yet.

**When to reconsider Trigger.dev**: If we just want a managed task queue without step-level durability, Trigger.dev's DX is very clean. But the lack of step-level resumability makes it only incrementally better than a well-configured SQS setup for our use case.

## POC Branches

Both POCs implement the same functionality (poll creation + expansion workflows) so you can compare apples to apples:

- **Inngest**: Branch `inngest-poc-3` ([PR #1033](https://github.com/thegoodparty/gp-api/pull/1033)) — see `docs/inngest-poc-demo.md`
- **Temporal**: Branch `temporal-poc` — see `docs/temporal-poc-demo.md`
