# 0001 — PrismaBase pattern

Status: accepted

## Context

Every service backed by a Prisma model needs the same things: a typed delegate, the full client for cross-model transactions, a context-tagged logger, and a handful of helpers (`findMany`, `findFirst`, `count`, optimistic-locking update).

Without a base class, every service duplicates the wiring. The implementations drift, especially around logging context and optimistic locking.

## Decision

All services backed by a Prisma model extend `createPrismaBase(MODELS.<Model>)` from `src/prisma/util/prisma.util.ts`.

```ts
@Injectable()
export class CampaignsService extends createPrismaBase(MODELS.Campaign) {
  constructor() {
    super()
  }
}
```

The base class provides:

- `this.model` — typed Prisma delegate for the specific model
- `this.client` — full `PrismaClient`
- `this.logger` — `PinoLogger` with context auto-set in `onModuleInit`
- Bound passthroughs: `findMany`, `findFirst`, `findFirstOrThrow`, `findUnique`, `findUniqueOrThrow`, `count`
- `optimisticLockingUpdate(params, modification)` — retries on `updatedAt` conflict

## Consequences

- New services pay zero ceremony to get the standard surface.
- Tests need to override `_prisma` via `Object.defineProperty` to mock — see `src/shared/test-utils/`.
- Services not backed by a single model (orchestrators, integrations) don't extend `createPrismaBase` and inject `PrismaService` directly.
