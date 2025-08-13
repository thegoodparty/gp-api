## GP-API Unit Testing Guide

This document explains how to run the test suite, write new tests, and follow conventions used in this NestJS/TypeScript project. It is intended for both humans and LLMs.

### Quick start

- Install dependencies (use the Node and npm versions in `package.json:engines`).
- Run the full suite:

```bash
npm run test
```

- Watch mode:

```bash
npm run test:watch
```

- Coverage report (HTML in `coverage/`):

```bash
npm run test:cov
```

Notes:
- Tests run with `TZ=UTC` for deterministic date behavior.
- Jest is configured to resolve `src/*` aliases via `moduleNameMapper`.

### Where tests live

- Unit tests live alongside source files under `src/**` and use the `*.spec.ts` suffix.
- Prefer colocating specs next to implementation (e.g., `src/shared/util/strings.util.ts` and `strings.util.spec.ts`).

### Frameworks and key libraries

- Jest + ts-jest
- @nestjs/testing for Nest modules
- http-constants-ts for MIME constants (do not use string literals)

### Running an individual test file or pattern

```bash
npx jest src/users/services/users.service.spec.ts
npx jest users.service --coverage
```

### Conventions and patterns

- Test filenames: `*.spec.ts`.
- Use `describe` and `it` blocks with clear, behavior-focused names.
- Type safety: never use the `any` type in new tests. Use real types or precise unions/generics.
- Keep tests deterministic: mock time, random, and network.
- One behavior per test; short, isolated expectations.

#### NestJS services

- Use `@nestjs/testing` to create a `TestingModule` with controllers/providers under test.
- For Prisma-backed services (those extending `createPrismaBase`):
  - Provide a mock `PrismaService` with the specific model methods used by the service (`findMany`, `findFirst`, `findFirstOrThrow`, `findUnique`, `findUniqueOrThrow`, `count`, `create`, `update`, `delete`).
  - After constructing the service, set the private prisma reference and invoke passthrough bindings:

```ts
// @ts-expect-error private assignment for test binding
service._prisma = prismaMock
await service.onModuleInit()
```

- For HTTP-based services:
  - Provide a mock `HttpService` and stub `lastValueFrom(...)` results.
  - Keep rxjs internals intact when mocking: spread the real module and override only `lastValueFrom`.

```ts
jest.mock('rxjs', () => ({
  ...jest.requireActual('rxjs'),
  lastValueFrom: jest.fn(),
}))
```

- For JWT usage, provide a mock `JwtService` with only required methods (e.g., `decode`).

#### External API calls and exceptions

- Follow project rules: wrap external service calls, and on failure throw `BadGatewayException` with a helpful message.
- Do not wrap Prisma DB operations in try/catch; rely on Prisma exception handling.
- Use `http-constants-ts` MIME constants in tests and code.

#### Mocking configuration and environment

- Services that extend configuration classes (e.g., Peerly) should be tested by mocking the config class to avoid real env requirements:

```ts
jest.mock('../config/peerlyBaseConfig', () => ({
  PeerlyBaseConfig: class {
    baseUrl = 'http://peerly'
    accountNumber = '123'
    httpTimeoutMs = 1000
  },
}))
```

- Avoid depending on real env vars in tests unless explicitly needed.

### Style and structure

- Keep arrange–act–assert structure clear and minimal.
- Prefer direct returns instead of temporary variables when asserting function results.
- Use ternary expressions when selecting single values per Rule 12.
- Remove unused imports and ensure no linter errors in tests.

### Common recipes

Mock Prisma model methods:

```ts
const prisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findFirstOrThrow: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    count: jest.fn(),
  },
}
```

Mock HTTP responses:

```ts
import { lastValueFrom } from 'rxjs'
;(lastValueFrom as unknown as jest.Mock).mockResolvedValueOnce({ data: { id: '123' } })
```

### Troubleshooting

- Worker leak or hanging tests:

```bash
npx jest --detectOpenHandles --runInBand
```

- Date flakiness: ensure tests do not rely on local timezone; `TZ=UTC` is enforced in scripts.
- Module resolution errors for `src/*`: ensure the `moduleNameMapper` section exists in `package.json` and that tests run from project root.

### Adding new tests checklist

- Place `*.spec.ts` next to the implementation under `src/**`.
- Mock all external boundaries (HTTP, queues, cloud SDKs, JWT, fs, timers).
- For Prisma services, set `_prisma` mock and call `onModuleInit()`.
- Use strict typing. No `any` in new tests.
- Use MIME constants from `http-constants-ts`.
- Keep tests fast and independent.


