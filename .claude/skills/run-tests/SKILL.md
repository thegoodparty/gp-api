---
name: run-tests
description: Run vitest tests in gp-api efficiently — single file, by name, integration with useTestService, or the full verify gate. Use whenever you need to check your work.
---

# Run tests

Vitest with SWC. `*.test.ts` files only (NOT `.spec.ts`). Loads `.env.test`. `clearMocks: true`.

## Targeted runs (prefer these)

```bash
npx vitest run src/path/to/file.test.ts                # single file, one shot
npx vitest run --testNamePattern "creates a campaign"  # by test name
npx vitest src/path/to/file.test.ts                    # watch single file
npx vitest run src/<feature>/                          # one feature folder
```

## Everything

```bash
npm test          # all unit + integration, one shot
npm run verify    # lint + tsc --noEmit + vitest run — same as CI gate
```

## Integration tests with `useTestService()`

For tests in `*.e2e.test.ts` or any test using `useTestService()`:

Call `useTestService()` at the top level of the file, not inside `beforeEach`.

```ts
import { useTestService } from '@/test-service'

const service = useTestService()

it('creates a campaign', async () => {
  const result = await service.client.post('/v1/campaigns', {...})
  expect(result.status).toBe(201)
})
```

`useTestService` spins a real Postgres container, runs migrations, bootstraps the full Nest app, and exposes an authed Axios client. Each suite gets a unique DB; tables truncate between tests. Default test user id: `123`.

Local Postgres / Docker must be running for these. If they fail with "connection refused", start Docker Desktop and retry.

## Unit tests — two patterns

Direct instantiation (preferred for controllers):

```ts
const mockService: Partial<ThingsService> = { findMany: vi.fn() }
const controller = new ThingsController(mockService as ThingsService)
```

`Test.createTestingModule` (when the DI graph is needed):

```ts
const module = await Test.createTestingModule({
  providers: [{ provide: PrismaService, useValue: mockPrisma }, ThingsService],
}).compile()
```

For services extending `PrismaBase`, override the internal client:

```ts
Object.defineProperty(service, '_prisma', { get: () => mockClient })
```

Use `createMockLogger()` from `src/shared/test-utils/mockLogger.util.ts` instead of constructing your own.

## Don't

- **Don't** name test files `*.spec.ts` — they won't be picked up.
- **Don't** put `useTestService()` inside `beforeEach`. It's a hook factory; call it once per file at the top level.
- **Don't** import from `node:test`. Banned by ESLint — use Vitest globals (`describe`, `it`, `expect`, `vi`).
- **Don't** run `npm test` repeatedly while iterating on one file. Use the targeted forms above.
