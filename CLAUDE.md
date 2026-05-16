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
| **Writing or editing code**  | **`.cursor/rules/*.mdc` — read first, every time** |
| Adding an endpoint           | `docs/architecture.md` § Module shape            |
| Touching contracts           | `docs/contracts.md`                              |
| Writing or fixing a test     | `docs/writing-tests.md`                          |
| Adding/debugging an alert    | `docs/observability.md`                          |
| Reproducing a reported bug   | `docs/debugging.md`                              |
| First-time setup             | `docs/getting-started.md` + `docs/team-setup.md` |
| Why a thing is the way it is | `docs/adr/`                                      |
| AI rule-by-rule code review  | `ai-rules/` (git submodule)                      |

## Cursor rules (`alwaysApply: true`) — read before writing code

Every file in `.cursor/rules/` carries `alwaysApply: true`. They override the rest of this file when they conflict. Read them before writing code, not after the review comes back.

| File                                       | Enforces                                                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `.cursor/rules/rules.mdc`                  | Rules 0–28: type safety, PrismaBase pattern, exception types, services/ layout, strict scope, library enums, date-fns, JSON columns, …  |
| `.cursor/rules/prettier-conformance.mdc`   | **80-char max line width**. Write Prettier-conformant on first write — no post-hoc formatting.                                          |
| `.cursor/rules/no-underscore-unused-vars.mdc` | Delete unused variables. Do **not** rename to `_foo`. Underscore is only OK for required-by-signature callback params and ignored iterators. |
| `.cursor/rules/no-clickup-mutations.mdc`   | Read-only ClickUp by default. Ask before any mutating MCP call.                                                                         |
| `.cursor/rules/no-unprompted-questions.mdc`| Don't ask "how would you like to proceed?" — only ask when genuinely blocked or ambiguous.                                              |
| `.cursor/rules/plans-must-show-diffs.mdc`  | Plans that change code must present every edit as a unified `diff` block.                                                               |

## Code style

- **No semicolons**, single quotes, trailing commas (`.prettierrc`)
- **Max 80-char lines.** Break long arg lists onto separate lines (prettier-conformance.mdc)
- **Default to writing no comments.** Only add one when the WHY is non-obvious: a hidden constraint, a subtle invariant, a workaround for a specific bug, behavior that would surprise a reader (rules.mdc Rule 4). Don't explain WHAT the code does — rename identifiers or extract functions instead.
- `@typescript-eslint/no-explicit-any` is an **error** — never use `any`. **Also never use `unknown`** in new code (rules.mdc Rule 0) — use proper types, generics, unions, or type guards.
- `unused-imports/no-unused-imports` is an **error**
- Delete unused variables; **don't `_`-prefix them** (no-underscore-unused-vars.mdc)
- Path alias: `@/*` → `src/*`
- Arrow functions over `function` declarations
- Bias to WET over premature DRY
- **Prefer ternaries** for single-value assignment/return (rules.mdc Rule 12)
- **No redundant variables for direct returns.** `return someAsync()`, not `const x = await someAsync(); return x` (rules.mdc Rule 13)
- **Strict scope.** Only the lines necessary for the request. No refactors, no surrounding cleanup, no "while I'm here" tweaks (rules.mdc Rule 5)

## Library constants over magic strings (rules.mdc Rule 26)

Before writing any string or numeric literal as an argument, check the owning library for an enum/constant. Examples:

- Prisma: `Prisma.QueryMode.insensitive`, `Prisma.SortOrder.desc` — not `'insensitive'` / `'desc'`
- NestJS: `HttpStatus.OK`, `HttpStatus.NO_CONTENT` — not `200` / `204`
- MIME types: `http-constants-ts` `MediaType.APPLICATION_JSON` (rules.mdc Rule 8)
- Project enums: `DomainStatus.registered`, `WebsiteStatus.published`, `QueueType.X`, etc.

## Date handling — date-fns (rules.mdc Rule 28)

Use `date-fns` for parse / format / arithmetic / compare / diff / start-or-end-of-period. Never use raw `Date` getters/setters or millisecond math. `new Date()` is only acceptable when fetching "now" to immediately pass into a `date-fns` function (or as a literal value into Prisma).

## Module pointers

Per-area `CLAUDE.md` files cover purpose, key files, patterns, and gotchas for the dirs you'll touch most:

| Working in                        | Read                                        |
| --------------------------------- | ------------------------------------------- |
| Campaigns / plans / tasks         | `src/campaigns/CLAUDE.md`                   |
| Voter file / L2 lookups           | `src/voters/CLAUDE.md`                      |
| Stripe payments / pro upgrades    | `src/payments/CLAUDE.md`                    |
| Campaign websites / domains       | `src/websites/CLAUDE.md`                    |
| SQS producer/consumer / async     | `src/queue/CLAUDE.md`                       |
| Auth, JWT, Clerk M2M, roles       | `src/authentication/CLAUDE.md`              |
| Agent experiments                 | `src/agentExperiments/CLAUDE.md`            |
| Schema / migrations               | `prisma/CLAUDE.md`                          |
| `@goodparty_org/contracts`        | `contracts/CLAUDE.md` + `docs/contracts.md` |
| Pulumi / Docker / Grafana         | `deploy/CLAUDE.md`                          |
| One-off / build scripts           | `scripts/CLAUDE.md`                         |
| Seed data / factories / scenarios | `seed/CLAUDE.md`                            |

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
2. `SessionGuard` — accepts user JWTs from cookies
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

## Exception handling (rules.mdc Rule 3)

- `BadRequestException` (400) — invalid input, validation failures, business-rule violations caused by user input
- `BadGatewayException` (502) — third-party / external service failures (Vercel, AWS, Stripe, etc.)
- `ConflictException` (409) — duplicates, resource-state conflicts
- `NotFoundException` (404) — missing resources
- DB ops rely on Prisma + global `PrismaExceptionFilter` — **do not** wrap them in try/catch
- **Wrap only external service calls in try/catch.** Keep DB operations outside the catch block so they aren't swallowed.
- `@HttpCode(HttpStatus.NO_CONTENT)` methods must **`await`** the service call — never `return` it (rules.mdc Rule 24).

## Never

- Never edit a file under `prisma/schema/migrations/<timestamp>/` — applied migrations are immutable.
- Never use `.passthrough()` on input schemas.
- Never use `any` or `unknown` in new code, and never disable `@typescript-eslint/no-explicit-any` without an inline comment justifying it.
- Don't leave `// removed X` markers, "TODO" trails for completed work, or commentary about the current task — those rot fast. Comments are reserved for non-obvious WHYs (rules.mdc Rule 4).
- Never add a JSON column when the data has a known structure or needs to be queried (rules.mdc Rule 25). Use real columns / relations.
- Never use raw `Date` arithmetic / setters / comparison — use `date-fns` (rules.mdc Rule 28).
- Never use a string/number literal where the library exposes an enum or constant (rules.mdc Rule 26).
- Never bypass `@goodparty_org/contracts` for cross-service shapes.
- Never `import 'node:test'` (banned by ESLint — use Vitest).
- Never run a mutating ClickUp MCP tool without explicit user permission (no-clickup-mutations.mdc).
- Never commit when `npm run lint` / `npm run verify` exits non-zero (rules.mdc Rule 27). Fix what you touched; raise pre-existing failures to the user.

## Environment

- Node `22.12.0` (`.nvmrc` + `engines`)
- npm `>= 10.9.0`
- `--legacy-peer-deps` set in `.npmrc`
- `@typescript-eslint/no-unsafe-assignment` is relaxed in test files only
