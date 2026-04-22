# Architecture

A pointer-heavy doc. Detailed conventions live in `CLAUDE.md` and `.cursor/rules/rules.mdc`.

## Stack

- NestJS 11 on Fastify (not Express)
- Prisma ORM on Postgres
- Zod for input/output validation everywhere
- SQS (FIFO) for async work
- OpenTelemetry + Pino for observability
- Pulumi for infra; ECS Fargate for runtime

## Module shape

Every feature module follows the same skeleton (enforced by `.cursor/rules/rules.mdc` Rule 7):

```
src/<feature>/
├── <feature>.module.ts
├── <feature>.controller.ts        # HTTP only, no business logic
├── services/
│   └── <feature>.service.ts       # extends createPrismaBase(...)
└── schemas/
    └── <action><Entity>.schema.ts # Zod
```

`src/users/` is a clean reference module — start there if you need a pattern to copy.

## Auth chain

Three global guards run on every request, in order:

1. `ClerkM2MAuthGuard` — accepts Clerk M2M tokens (`mt_*`).
2. `JwtAuthGuard` — accepts user JWTs from cookies.
3. `RolesGuard` — enforces `@Roles(...)` decorators.

Route decorators:

- `@PublicAccess()` — skip JWT/roles enforcement
- `@Roles(UserRole.ADMIN)` — require role
- `@ReqUser()` — extract `request.user`

## Queue (SQS FIFO)

One queue, many message types. Producer at `src/queue/producer/`. Consumer at `src/queue/consumer/queueConsumer.service.ts` — a single switch on `QueueType`. The consumer module is excluded when `NODE_ENV === 'test'`.

The consumer file is large (~1100 lines). A future refactor will split per-`QueueType` handler.

## Cross-service edges

- `gp-webapp` -> `gp-api`: JWT cookie
- `gp-api` -> `people-api`: S2S JWT signed with `PEOPLE_API_S2S_SECRET`
- `gp-api` -> `election-api`: HTTP, internal
- `gp-api` -> `gp-ai-projects`: HTTP

Shared types between `gp-api` and `gp-webapp`/`gp-sdk` flow through `@goodparty_org/contracts` (see `docs/contracts.md`).

## Bootstrap

`src/app.ts` exports `bootstrap()` used by both `main.ts` and `src/test-service.ts`. Global prefix is `/v1`. Fastify plugins: helmet, CORS, cookies, multipart (10MB).

## ADRs

See `docs/adr/` for non-obvious decisions (PrismaBase pattern, single FIFO queue, etc.).
