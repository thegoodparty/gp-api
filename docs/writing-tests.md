# Writing tests

We use **Vitest** with SWC (required for NestJS decorator metadata). Test files end in `.test.ts` (never `.spec.ts`). Loads `.env.test`; `clearMocks: true`.

We treat every test as a unit test. There is no separate "integration" tier and no e2e tier. What varies is how much of the app the test exercises and where the seams are mocked.

## Picking an approach

Three patterns, in increasing cost:

1. **Direct instantiation** — `new Controller(mockDeps)`. Fastest. Use for controllers and any service whose dependencies you can hand-roll in a few lines.
2. **`Test.createTestingModule`** — Nest's DI container with mock providers. Use when the unit under test reaches for things via DI in a way that's awkward to construct manually (lots of providers, decorators that need module wiring).
3. **`useTestService()`** — boots the real app against a real Postgres (testcontainers). Use when the value of the test depends on the real database doing real things: SQL behavior, Prisma constraints, transaction semantics, race conditions, raw queries, the global Zod response interceptor, the auth guards.

`useTestService()` is not a fallback or a heavyweight integration harness — it's a unit-testing tool for the parts of the system whose contract _is_ the database or the full request pipeline. Reach for it when mocking would force you to re-implement Postgres, Prisma, or our framework in the test, because at that point the test verifies the mocks rather than the code.

## Pattern 1: Direct instantiation

Best for controllers and small services. Hand-roll the deps inline.

```ts
import { describe, expect, it, vi } from 'vitest'

const mockService: Partial<CampaignsService> = {
  findMany: vi.fn().mockResolvedValue([]),
}

const controller = new CampaignsController(
  mockService as CampaignsService,
  mockAnalytics as AnalyticsService,
)

it('returns an empty list', async () => {
  const result = await controller.list()
  expect(result).toEqual([])
})
```

For services backed by `createPrismaBase`, override the internal client:

```ts
Object.defineProperty(service, '_prisma', { get: () => mockClient })
```

## Pattern 2: `Test.createTestingModule`

Reach for this when the unit pulls in enough providers that hand-rolling them gets noisy. Provide mocks for everything the constructor touches.

```ts
const module = await Test.createTestingModule({
  providers: [
    AnalyticsService,
    { provide: SegmentService, useValue: mockSegment },
    { provide: UsersService, useValue: mockUsersService },
    { provide: PinoLogger, useValue: createMockLogger() },
  ],
}).compile()

const service = module.get(AnalyticsService)
```

See `src/analytics/analytics.service.test.ts` for a worked example.

## Pattern 3: `useTestService()`

Spins up a real Postgres in Docker, runs migrations, bootstraps the full Nest app, and exposes an authed Axios client plus a Prisma client. Each test file gets its own database; tables are truncated between tests. Default authenticated user id is `123`.

```ts
import { useTestService } from '@/test-service'

const service = useTestService()

describe('UsersService', () => {
  let usersService: UsersService

  beforeEach(() => {
    usersService = service.app.get(UsersService)
  })

  it('finds a user by email case-insensitively', async () => {
    const user = await usersService.findUserByEmail('TESTS@GOODPARTY.ORG')
    expect(user?.id).toBe(service.user.id)
  })
})
```

Use the HTTP client when the test's value lies in the request pipeline (validation, guards, interceptors, response shape):

```ts
const result = await service.client.post('/v1/campaigns', { slug: 'foo' })
expect(result.status).toBe(201)
```

Use `service.prisma` to seed the database directly — bypassing the API is fine for setup. Override providers per-test by grabbing them off the app and mocking with `vi.spyOn`:

```ts
const contacts = service.app.get(ContactsService)
vi.spyOn(contacts, 'getDistrictStats').mockResolvedValue({ ... })
```

See `src/users/services/users.service.test.ts` and `src/polls/polls.test.ts` for representative examples.

## Helpers

Under `src/shared/test-utils/`:

- `createMockLogger()` — a fully-stubbed `PinoLogger`
- `createMockClerkEnricher()` — stub for `ClerkUserEnricherService`
- `createMockUser()`, `createMockCampaign()`, etc. — factories under `factories/`

Prefer these over re-rolling stubs.

## Running tests

```bash
npm test                                            # full suite
npx vitest run src/path/to/file.test.ts             # single file
npx vitest run --testNamePattern "case-insensitive" # by name
npm run verify                                      # lint + tsc + tests
```

`useTestService()` tests need Docker running locally. The first run pulls `postgres:16-alpine`; subsequent runs reuse the container.

## Anti-patterns

- Mocking Prisma to test SQL behavior. If the test's purpose is "does this query return what I think it returns", use `useTestService()` — a mock just asserts the mock.
- Asserting on private methods. Test the public surface (controller route, service method).
- Sharing mutable state between tests in a file. Reset in `beforeEach`. With `useTestService()`, tables are already truncated for you.
- Adding a new pattern. If none of the three above fit, raise it before inventing a fourth.
