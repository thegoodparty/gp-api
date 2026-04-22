# 0002 — Zod for every boundary

Status: accepted

## Context

A Nest controller can derive types from `class-validator` decorators, plain DTOs, or Zod. Each external boundary (HTTP request, HTTP response, queue message, third-party API, parsed config) needs validation independent of TypeScript types — TS doesn't run at runtime.

## Decision

Use Zod schemas at every boundary. Live in `src/<feature>/schemas/<action><Entity>.schema.ts`. Reuse exports from `@goodparty_org/contracts` when the shape crosses the gp-webapp/gp-sdk boundary.

- Inputs are validated by `ZodValidationPipe`.
- Outputs are validated by the global `ZodResponseInterceptor` against schemas declared via `@ResponseSchema(...)`.
- Queue messages are parsed with their schema before dispatch.

## Rules

- Never use `.passthrough()` on input schemas. Use `.strict()` to reject unknown keys.
- Never declare fields as `z.record(z.string(), z.unknown())` if the real shape is known.
- Never derive controller response types from the handler return — declare them.

## Consequences

- Runtime type safety at the cost of a schema file per shape.
- Schemas become the single source of truth for client SDK generation.
