# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**gp-api** — NestJS/Fastify backend for GoodParty.org. Prisma ORM on PostgreSQL. Provides APIs for campaign management, voter outreach, AI-powered campaign planning, candidate websites, and payment processing.

## Commands

### Development
```bash
npm run start:dev          # Dev server (:3000) — auto-builds contracts, checks pending migrations
npm run build              # Production build (builds contracts first)
npm run infra diff <env>   # Preview infra changes (dev|qa|prod|preview)
npm run infra deploy <env> # Deploy to ECS via Pulumi
```

### Database
```bash
npm run migrate:dev        # Create/apply migrations
npm run migrate:deploy     # Apply migrations (production)
npm run migrate:reset      # Reset DB + run migrations + seed
npm run generate           # Regenerate Prisma client
npm run seed               # Seed local DB (CSV seeds only in non-local envs)
```

### Testing
```bash
npm test                   # Run all unit/integration tests (vitest)
npx vitest run src/path/to/file.test.ts              # Run a single test file
npx vitest run --testNamePattern "test name pattern"  # Run tests matching name
npx vitest --ui            # Vitest UI

npm run test:e2e           # E2E tests (Playwright, needs running API)
npm run test:e2e:ui        # E2E with Playwright UI
```

### Code Quality
```bash
npm run lint               # ESLint with auto-fix
npm run lint-format        # ESLint + Prettier
npm run format             # Prettier only
npm run prisma-format      # Format Prisma schema files
```

## Code Style

- **No semicolons**, single quotes, trailing commas everywhere (`.prettierrc`)
- **No comments** in code
- `@typescript-eslint/no-explicit-any` is an **error** — never use `any`
- `unused-imports/no-unused-imports` is an **error**
- Path alias: `@/*` → `src/*` (e.g., `import { Foo } from '@/shared/util/foo'`)

## Architecture

### Module Organization

Every feature module follows this structure:
```
src/featureName/
├── featureName.module.ts       # NestJS module
├── featureName.controller.ts   # HTTP concerns only
├── services/
│   └── featureName.service.ts  # Data operations (extends createPrismaBase)
└── schemas/                    # Zod schemas for I/O validation
```

Service files **must** live in `services/` subdirectories. Controllers handle HTTP, services handle data.

### PrismaBase Pattern

All services backed by a Prisma model **must** extend `createPrismaBase(MODELS.ModelName)`:

```typescript
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'

@Injectable()
export class CampaignsService extends createPrismaBase(MODELS.Campaign) {
  constructor() { super() }

  async findBySlug(slug: string) {
    return this.model.findUnique({ where: { slug } })
  }
}
```

This base class provides:
- `this.model` — typed Prisma delegate for the specific model
- `this.client` — full `PrismaClient` for cross-model transactions
- `this.logger` — `PinoLogger` (context set automatically in `onModuleInit`)
- Passthrough methods bound at init: `findMany`, `findFirst`, `findFirstOrThrow`, `findUnique`, `findUniqueOrThrow`, `count`
- `optimisticLockingUpdate(params, modification)` — retry-based concurrency control using `updatedAt`

### Prisma Schema

Modularized in `prisma/schema/` with separate `.prisma` files per domain (user, campaign, pathToVictory, aiChat, website, outreach, schema).

### Contracts Package

`contracts/` is an npm workspace (`@goodparty_org/contracts`) containing shared Zod schemas and TypeScript types. Auto-built during `start:dev` and `build`. Key exports: `ReadUserOutput`, `CampaignSchema`, `ReadCampaignOutput`, generated Prisma enums, pagination types.

### Authentication Flow

Three global guards execute in sequence on every request:

1. **`ClerkM2MAuthGuard`** — if token starts with `mt_`, verifies via Clerk M2M; sets `request.m2mToken`
2. **`JwtAuthGuard`** — skips if M2M token present or route is public+no-roles; otherwise requires JWT Bearer token
3. **`RolesGuard`** — enforces `@Roles()` decorator requirements

Key decorators:
- `@PublicAccess()` — marks route as public (skips auth only if no `@Roles()` also set)
- `@Roles(...roles)` — requires specific `UserRole[]`
- `@ReqUser()` — parameter decorator extracting `request.user`

Additional route-level guards: `AdminOrM2MGuard`, `M2MOnly`

### Zod Response Validation

Use `@ResponseSchema(zodSchema)` on controller methods + `ZodResponseInterceptor` to validate outgoing responses against Zod schemas at runtime.

### Queue System (SQS)

Single FIFO queue with producer/consumer pattern. Producer in `src/queue/producer/`, consumer in `src/queue/consumer/`. Consumer uses a switch on `QueueType` enum to dispatch messages. Key queue types: `GENERATE_AI_CONTENT`, `PATH_TO_VICTORY`, `TCR_COMPLIANCE_STATUS_CHECK`, `DOMAIN_EMAIL_FORWARDING`, `POLL_ANALYSIS_COMPLETE`, `POLL_CREATION`, `POLL_EXPANSION`.

The `QueueConsumerModule` is excluded when `NODE_ENV === 'test'`.

### Global Interceptors

- `ImpersonationInterceptor` — propagates impersonation state from JWT to AsyncLocalStorage for analytics tagging
- `AdminAuditInterceptor` — logs all admin route accesses
- `BlockedStateInterceptor` — records user-blocking failures to New Relic/OpenTelemetry

### Bootstrap

`src/app.ts` exports the `bootstrap()` factory (used by both `main.ts` and tests). Global prefix is `/v1`. Fastify plugins: helmet, CORS, cookies, multipart (10MB limit). Swagger at `/api`.

## Testing

### Configuration

- **Framework**: Vitest with SWC (required for NestJS decorator metadata)
- **Test files**: `*.test.ts` only (NOT `.spec.ts` — vitest config include pattern)
- **Env**: Loads from `.env.test`
- `clearMocks: true` — mock call history auto-cleared between tests (implementations persist)

### Integration Tests: `useTestService()`

`src/test-service.ts` provides a hook that spins up a real PostgreSQL container via testcontainers, runs migrations, bootstraps the full NestJS app, and provides an authenticated HTTP client:

```typescript
const service = useTestService()

it('creates a campaign', async () => {
  await service.prisma.campaign.create({ data: { userId: service.user.id, slug: 'test' } })
  const result = await service.client.post('/v1/campaigns', { ... })
  expect(result.status).toBe(201)
})
```

- Each test suite gets a unique database; tables are truncated between tests
- A default test user (id: 123) is created before each test
- `service.client` is an Axios instance with auto-injected JWT auth
- `service.app` exposes the NestJS DI container for `app.get(ServiceClass)`

### Unit Tests

Two patterns:

**Direct instantiation** (preferred for controllers/simple services):
```typescript
const mockService: Partial<CampaignsService> = { findMany: vi.fn() }
controller = new CampaignsController(mockService as CampaignsService, ...)
```

**`Test.createTestingModule`** (when NestJS DI is needed):
```typescript
const module = await Test.createTestingModule({
  providers: [
    { provide: PrismaService, useValue: mockPrisma },
    CampaignsService,
  ],
}).compile()
```

Override PrismaBase internals via `Object.defineProperty(service, '_prisma', { get: () => mockClient })`.

### Mocking Dependencies

- **Partial mock objects cast to type** — most common for service mocks
- **`vi.spyOn()`** — for overriding specific methods on live instances
- **`vi.mock()` with `vi.hoisted()`** — for module-level mocking (AWS SDK, third-party libs)
- **`aws-sdk-client-mock`** — for AWS SDK v3 command mocking
- **`createMockLogger()`** from `src/shared/test-utils/mockLogger.util.ts` — used in virtually every test

### AI Code Review

The `ai-rules/` directory contains rule files for focused code review. When writing or modifying code, consider spawning a critic subagent for each relevant rule file:

```
Read each .md file in ai-rules/. For each rule file relevant to my changes,
review the code I changed against those rules. For each violation, cite the
rule number, quote the offending code, and explain what to change.
```

## Exception Handling

- `BadRequestException` for client input errors
- `BadGatewayException` for external service failures
- Database operations rely on Prisma's built-in exception handling + global `PrismaExceptionFilter`
- Wrap only external service calls in try-catch blocks

## Important Notes

- `--legacy-peer-deps` required for npm install
- Node 22.12.0 (use `nvm use`)
- `import 'node:test'` is banned by ESLint — use Vitest
- `@typescript-eslint/no-unsafe-assignment` is relaxed in test files only
