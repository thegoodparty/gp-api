# Logging Strategy for Grafana Integration

## Current State

- **~572 log calls** across ~200 files use `new Logger(ClassName.name)` from `@nestjs/common`
- NestJS's `ConsoleLogger` writes unstructured text to stdout
- Fastify's built-in Pino logger handles HTTP req/res logging (barely configured)
- CloudWatch captures stdout → a Lambda forwarder ships to New Relic
- We are integrating with Grafana Cloud via OpenTelemetry (OTLP) for traces and metrics. Logs are the remaining signal to solve.

### Key Constraint

The OTel Logs SDK is purely programmatic — it does **not** hook into stdout. Even if we configure an OTLP log exporter in the OTel SDK, application logs won't automatically flow through it. The NestJS Logger writes to stdout via `ConsoleLogger`, and the OTel SDK has no stdout interceptor. We need something that bridges application log calls → the OTel LoggerProvider.

---

## Option A: CloudWatch → Grafana (Quick & Dirty)

Replace the New Relic Lambda forwarder with Grafana's [Lambda Promtail](https://grafana.com/docs/loki/latest/send-data/lambda-promtail/) (or a simple Lambda that pushes to Loki's HTTP API). Zero app code changes.

### Pros

- Fastest to ship.
- Zero risk to application code. No migration of log call sites.
- Logs start flowing to Grafana immediately.

### Cons

- Logs arrive as **unstructured text blobs** in Loki. Requires LogQL `| pattern` or `| regexp` parsers to extract anything useful.
- **No trace-log correlation** — log lines won't have `trace_id`/`span_id`, so you can't click from a Grafana trace to associated logs.
- No request context on logs (user, request ID).
- Paying for CloudWatch ingestion AND Loki ingestion (double-billing on log storage).
- Adds CloudWatch subscription filter latency.

### When This Makes Sense

As a transitional step to get _something_ in Grafana while building the real solution. Can run in parallel with New Relic during migration.

---

## Option B: `nestjs-pino` + `@opentelemetry/instrumentation-pino`

Replace the NestJS `ConsoleLogger` with [`nestjs-pino`](https://github.com/iamolegga/nestjs-pino) for structured JSON logging via Pino. Add [`@opentelemetry/instrumentation-pino`](https://www.npmjs.com/package/@opentelemetry/instrumentation-pino) to the OTel SDK init, which automatically:

1. Injects `trace_id` / `span_id` into every log line
2. Forwards all logs to the OTel LoggerProvider, which exports them via OTLP to Grafana Cloud

### What This Gets Us

- **Structured JSON logs** to stdout (queryable in CloudWatch too)
- **Automatic trace-log correlation** in Grafana — click from a trace to its logs and vice versa
- **Request-scoped context** (user ID, request ID) on every log via `nestjs-pino`'s built-in `AsyncLocalStorage` and `PinoLogger.assign()`
- **`pino-pretty`** for local dev so logs are still human-readable
- Logs forwarded to Grafana via OTLP alongside traces and metrics

### Migration Scope

#### Why Call Sites Need Updating

The NestJS `Logger` interface and Pino's API have different calling conventions. When `nestjs-pino` is set as the app-level LoggerService, **extra arguments beyond the message string are silently dropped**.

For example, this common pattern in our codebase:

```typescript
this.logger.error('Failed to fetch from people API', { error, url })
```

The chain is:

1. NestJS `Logger` appends its stored context → `loggerService.error('Failed to fetch...', { error, url }, 'MyService')`
2. nestjs-pino pops the last arg as context, passes the rest as Pino interpolation values
3. Pino receives `{ error, url }` as an interpolation arg, but the message has no `%o` placeholder → **object is silently discarded**

The `nestjs-pino` README acknowledges this: _"it's not possible to detect if the last argument is context or an interpolation value...logging with such injected class still works, but only for 1 argument."_

#### What Changes

Services switch from a class property to a constructor-injected `PinoLogger`:

```typescript
// Before
import { Logger } from '@nestjs/common'

export class MyService {
  private readonly logger = new Logger(MyService.name)

  doWork() {
    this.logger.log('Processing')
    this.logger.error('Failed to fetch', { error, url })
  }
}

// After
import { PinoLogger } from 'nestjs-pino'

export class MyService {
  constructor(private readonly logger: PinoLogger) {
    logger.setContext(MyService.name)
  }

  doWork() {
    this.logger.info('Processing')
    this.logger.error({ error, url }, 'Failed to fetch')
  }
}
```

Key changes per call site:

- `this.logger.log(msg)` → `this.logger.info(msg)` (Pino has no `.log()`)
- `this.logger.error(msg, extra)` → `this.logger.error(extra, msg)` (object-first convention)
- `this.logger.debug(msg, extra)` → `this.logger.debug(extra, msg)`
- Single-arg calls (`this.logger.warn('something')`) — only `.log()` → `.info()` needs renaming

#### Scripted Migration

The pattern is highly consistent across the codebase (`private readonly logger = new Logger(X.name)` everywhere). A codemod script can handle:

- Renaming `.log()` → `.info()`
- Swapping argument order when there are 2 arguments (object + message)
- Converting the property declaration to a constructor parameter with `setContext()`

Imports would be updated manually (or via a separate find-and-replace pass) since they vary in structure. But, there's only ~60 of those -- they could be manually updated in less than 5 minutes.

**Estimated scope**: ~100+ files touched, but mechanically via script. Config/setup is ~100-200 lines of new code.

### New Dependencies

- `nestjs-pino` — NestJS Pino integration with AsyncLocalStorage-based request scoping
- `pino-http` — HTTP request/response logging middleware (peer dep of nestjs-pino)
- `pino-pretty` — human-readable local dev output (dev dependency)
- `@opentelemetry/instrumentation-pino` — auto-injects trace context + forwards logs to OTel SDK

---

## Option C: Custom NestJS `LoggerService` → OTel Logs API (Minimal)

Write a custom `LoggerService` that bridges `Logger.log/error/warn/debug` calls directly to the OTel `LoggerProvider` (via `@opentelemetry/api-logs`). Keep the NestJS Logger interface and stdout output, but also emit structured `LogRecord`s to OTel.

### Pros

- Smallest code change. No new dependencies beyond the OTel SDK packages (`@opentelemetry/api-logs`, `@opentelemetry/sdk-logs`).
- Zero changes to existing log call sites.
- Preserves current stdout text logging alongside OTel emission.
- No new logging library to learn.

### Cons

- Stdout logs remain unstructured text (CloudWatch still gets text blobs).
- Building the bridge that `@opentelemetry/instrumentation-pino` gives you for free.
- Request context injection requires adding `AsyncLocalStorage` manually — same complexity as Option B, but without `nestjs-pino` handling it.
- The NestJS Logger interface is quirky — the last variadic arg is the "context" string, extra args can be objects or functions. Serializing these correctly into structured OTel LogRecords is tricky and error-prone.
- No structured JSON in stdout/CloudWatch unless you also JSON-serialize in the custom logger.

---

## Comparison

|                           | Option A: CloudWatch Pipe | Option B: nestjs-pino + OTel | Option C: Custom LoggerService |
| ------------------------- | ------------------------- | ---------------------------- | ------------------------------ |
| **App code changes**      | None                      | ~100 files (scripted)        | ~100 lines (bridge)            |
| **JSON structured logs**  | No                        | Yes                          | Only in OTel, not stdout       |
| **Trace-log correlation** | No                        | Yes (automatic)              | Yes (manual span ctx read)     |
| **Request context**       | No                        | Yes (built-in)               | Requires extra work            |
| **New dependencies**      | 0                         | 4 packages                   | 0                              |
| **Long-term value**       | Low                       | High                         | Medium                         |

## Recommendation

**Option B** is the strongest long-term investment, and doesn't require _tons_ of upfront time. It gives us structured JSON logs, automatic trace correlation, and request context using well-maintained, widely-adopted libraries (`nestjs-pino` has ~700k weekly npm downloads, `pino` itself has 23M). The migration is mechanical and scriptable, and could be accomplished in a few hours.
