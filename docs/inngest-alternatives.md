# Background Job Alternatives Considered

This document outlines the background job solutions we evaluated before choosing Inngest, and why each was not the right fit for our team.

## Current Solution: SQS FIFO Queue

**What it is:** A single AWS SQS FIFO queue with a polling consumer running in our NestJS API.

**Why it's not sufficient:**

- Minimal observability—failures require digging through CloudWatch logs
- Single queue means one failing job type can block others
- No built-in retry strategies or backoff
- DLQ replay requires manual AWS Console intervention
- No workflow orchestration (multi-step jobs require manual state management)
- Polling-based consumption adds latency

## EventBridge (Alone)

**What it is:** AWS's serverless event bus for routing events between services.

**Why it's not a substitute:**

- EventBridge is an event router, not a job processor
- Routes events to targets but doesn't manage execution, retries, or state
- Would still need SQS or Lambda on the receiving end
- Doesn't solve observability problems
- Adds complexity without addressing core pain points

## EventBridge + Step Functions

**What it is:** The full AWS-native workflow orchestration solution. EventBridge routes events to Step Functions state machines, which orchestrate Lambda functions.

**Why it's not the right fit:**

- **Requires Lambda functions:** Job logic must be extracted from our NestJS API into separate Lambdas. This fragments our codebase and complicates local development.
- **Steep learning curve:** Workflows are defined in Amazon States Language (ASL), a JSON-based DSL. Our team would need to learn this plus manage IAM roles for each Lambda.
- **Cold start latency:** Lambda cold starts add latency to job execution.
- **Higher operational overhead:** More infrastructure to manage (EventBridge rules, Step Functions, Lambda functions, IAM policies).
- **Cost at scale:** Step Functions charges ~$0.025 per 1,000 state transitions. Multi-step workflows can get expensive.
- **Local development friction:** Requires LocalStack or SAM CLI to test locally, which doesn't perfectly mirror production.

| Capability              | Step Functions | Inngest         |
| ----------------------- | -------------- | --------------- |
| Code location           | Lambda         | Your API        |
| Workflow definition     | ASL (JSON)     | TypeScript      |
| Local dev               | LocalStack/SAM | Dev Server      |
| Learning curve          | High           | Low             |
| Infrastructure overhead | High           | Low (HTTP only) |

## BullMQ

**What it is:** A Redis-based queue for Node.js with support for job prioritization, rate limiting, and repeatable jobs.

**Why it's not the right fit:**

- **Requires Redis infrastructure:** We'd need to provision and manage ElastiCache or a Redis instance. This adds operational burden and cost.
- **No managed dashboard:** Observability requires self-hosting Bull Board or similar.
- **Single point of failure:** Redis availability becomes critical to job processing.
- **No workflow orchestration:** Multi-step jobs require manual implementation.
- **Memory constraints:** Large job payloads can strain Redis memory.

## Temporal

**What it is:** An open-source, enterprise-grade workflow orchestration platform.

**Why it's not the right fit:**

- **Significant infrastructure:** Requires running Temporal Server (or paying for Temporal Cloud), plus a database backend.
- **Overkill for our needs:** Designed for complex, long-running workflows with advanced features we don't need (versioning, visibility queries, child workflows).
- **Steeper learning curve:** Requires understanding Temporal's programming model (activities, workflows, workers).
- **Cost:** Temporal Cloud pricing starts higher than Inngest for our expected volume.

## Why Inngest

Inngest addresses our specific pain points without the overhead of AWS-native solutions:

- **Runs in our existing API:** No Lambda extraction, no separate infrastructure
- **TypeScript-first:** Workflows defined in code, not JSON/YAML
- **Zero infrastructure:** HTTP-based, no queues or databases to manage
- **Excellent DX:** Local dev server, one-click replays, visual dashboard
- **Right-sized:** Powerful enough for our needs without enterprise complexity
- **Open source option:** Can self-host if vendor concerns arise
