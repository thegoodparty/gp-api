# CLAUDE.md

Guidance for Claude Code and other AI agents working in `gp-api`. Keep this file short — push detail into `docs/`.

## Project

NestJS/Fastify backend on Postgres via Prisma. Provides APIs for campaign management, voter outreach, AI-powered campaign planning, candidate websites, and payment processing.

## Commands (most-used first)

```bash
npm run start:dev              # Dev server (:3000) — auto-builds contracts, checks pending migrations
npm run verify                 # lint + tsc --noEmit + vitest run
npm test                       # vitest only
npx vitest run src/path/to/file.test.ts                # single file
npx vitest run --testNamePattern "name"                # by test name

npm run migrate:dev            # create/apply a migration
npm run migrate:reset          # reset DB + migrate + seed (LOCAL ONLY)
npm run generate               # regenerate Prisma client + route types

npm run lint                   # ESLint + prettier --check
npm run lint:fix               # auto-fix
npm run build                  # production build (builds contracts first)

npm run infra diff <env>       # preview infra changes (dev|qa|prod|preview)
npm run infra deploy <env>     # deploy via Pulumi
```

`--legacy-peer-deps` is set in `.npmrc`; plain `npm install` and `npm ci` work.

## Pointer table — when in doubt

| Doing                        | Read                                             |
| ---------------------------- | ------------------------------------------------ |
| Adding an endpoint           | `docs/architecture.md` § Module shape            |
| Touching contracts           | `docs/contracts.md`                              |
| Writing or fixing a test     | `docs/writing-tests.md`                          |
| Adding/debugging an alert    | `docs/observability.md`                          |
| Reproducing a reported bug   | `docs/debugging.md`                              |
| First-time setup             | `docs/getting-started.md` + `docs/team-setup.md` |
| Why a thing is the way it is | `docs/adr/`                                      |
| AI rule-by-rule code review  | `ai-rules/` (git submodule)                      |

## Code style

- **No semicolons**, single quotes, trailing commas (`.prettierrc`)
- **No comments** unless the WHY is non-obvious
- `@typescript-eslint/no-explicit-any` is an **error** — never use `any`
- `unused-imports/no-unused-imports` is an **error**
- Path alias: `@/*` → `src/*`
- Arrow functions over `function` declarations
- Bias to WET over premature DRY

## Module shape (enforced by `.cursor/rules/rules.mdc` Rule 7)

```
src/<feature>/
├── <feature>.module.ts
├── <feature>.controller.ts        # HTTP only, no business logic
├── services/
│   └── <feature>.service.ts       # extends createPrismaBase(MODELS.X)
└── schemas/
    └── <action><Entity>.schema.ts # Zod
```

`src/users/` is a clean reference to copy.

## PrismaBase pattern

Services backed by a Prisma model **must** extend `createPrismaBase(MODELS.ModelName)`:

```ts
@Injectable()
export class CampaignsService extends createPrismaBase(MODELS.Campaign) {
  constructor() {
    super()
  }
}
```

Provides `this.model`, `this.client`, `this.logger`, bound passthroughs (`findMany`, `findFirst`, `count`, etc.), and `optimisticLockingUpdate`. ADR: `docs/adr/0001-prisma-base-pattern.md`.

## Auth

Three global guards run in order:

1. `ClerkM2MAuthGuard` — accepts `mt_*` tokens via Clerk M2M
2. `JwtAuthGuard` — accepts user JWTs from cookies
3. `RolesGuard` — enforces `@Roles(...)`

Decorators: `@PublicAccess()`, `@Roles(UserRole.X)`, `@ReqUser()`. Route-level guards: `AdminOrM2MGuard`, `M2MOnly`. ADR: `docs/adr/0004-clerk-m2m-auth.md`.

## Zod validation

Use `@ResponseSchema(zodSchema)` on controller methods + the global `ZodResponseInterceptor` to validate outgoing responses at runtime. Never use `.passthrough()` on input schemas. ADR: `docs/adr/0002-zod-everywhere.md`.

## Queue (SQS FIFO)

One queue, switch on `QueueType` enum. Producer in `src/queue/producer/`, consumer in `src/queue/consumer/`. The `QueueConsumerModule` is excluded when `NODE_ENV === 'test'`. ADR: `docs/adr/0003-fifo-sqs-single-queue.md`.

## Testing

- Framework: **Vitest** with SWC (required for NestJS decorator metadata)
- Test file pattern: `*.test.ts` only (NOT `.spec.ts`)
- Loads `.env.test`; `clearMocks: true`
- Every test is a unit test. There is no separate integration or e2e tier.

Three patterns, in increasing cost: direct instantiation, `Test.createTestingModule`, and `useTestService()` (boots the real app against a Postgres container). Reach for `useTestService()` when the test's value depends on Postgres, Prisma, or the full request pipeline doing real work — not as a fallback when mocking gets hard.

Full guide and worked examples: `docs/writing-tests.md`.

## AI code review (`ai-rules/`)

`ai-rules/` is a git submodule with focused `.md` rule files (security, ts-engineer, breaking-changes, code-duplication, etc.). When you finish a substantive change:

> Read each .md file in `ai-rules/`. For each rule file relevant to my changes, review the code I changed against those rules. For each violation, cite the rule number, quote the offending code, and explain what to change.

The submodule is initialized automatically by `npm install` via the `postinstall` script. If `ls ai-rules/` is empty, run `git submodule update --init --recursive`.

## Exception handling

- `BadRequestException` for client input errors
- `BadGatewayException` for external service failures
- DB ops rely on Prisma + global `PrismaExceptionFilter`
- Wrap only external service calls in try/catch

## Never

- Never edit a file under `prisma/schema/migrations/<timestamp>/` — applied migrations are immutable.
- Never use `.passthrough()` on input schemas.
- Never disable `@typescript-eslint/no-explicit-any` without an inline comment justifying it.
- Never bypass `@goodparty_org/contracts` for cross-service shapes.
- Never `import 'node:test'` (banned by ESLint — use Vitest).

## Environment

- Node `22.12.0` (`.nvmrc` + `engines`)
- npm `>= 10.9.0`
- `--legacy-peer-deps` set in `.npmrc`
- `@typescript-eslint/no-unsafe-assignment` is relaxed in test files only
