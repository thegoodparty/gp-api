---
name: update-contract
description: Add or change a Zod schema in the @goodparty_org/contracts package and rebuild it so gp-webapp and other consumers see the new types. Use when a shape crosses a service boundary.
---

# Update a contract

`contracts/` is an npm workspace package (`@goodparty_org/contracts`) that holds the Zod schemas + inferred types shared across gp-api and gp-webapp. Reference: `docs/contracts.md`, ADR `docs/adr/0005-contracts-package.md`.

## 1. Decide if the shape belongs in contracts

Yes if **any** of:

- It is in an HTTP response another service deserializes.
- It is a queue message payload another consumer reads.
- It is a config blob persisted to one service and read by another.

No (keep in the feature module's `schemas/`) if:

- It is internal to gp-api (request body validated and consumed in-process).
- It is a one-off DTO for an admin-only endpoint with no external consumer.

## 2. Edit the schema in contracts

```
contracts/src/
├── campaigns/
├── ecanvasser/
├── shared/
├── users/
├── generated/    # do not edit by hand — Prisma-derived types
└── index.ts      # public surface — re-export new schema here
```

Add/edit the schema in the topical folder, then export from `index.ts`.

## 3. Rebuild contracts

```bash
npm run build:contracts
```

This is the source of truth for what consumers see. It runs as part of `npm run build` and `npm run start:dev`, so a missed rebuild is usually caught — but run it explicitly when iterating.

## 4. Use the schema in gp-api

Import from `@goodparty_org/contracts`:

```ts
import { CampaignDetailsSchema } from '@goodparty_org/contracts'

@Get(':id')
@ResponseSchema(CampaignDetailsSchema)
get(@Param('id') id: string) { ... }
```

## 5. Update the consumer (gp-webapp etc.)

Cross-repo PR. The consumer pulls the new contracts via its own `npm install` after this PR merges and the contracts package version bumps (or via workspace symlink in dev).

Coordinate the merge order with the consumer PR — usually contracts/gp-api ships first, consumer ships second.

## Never

- **Never** redeclare in `gp-api/src/...` a schema that already lives in `contracts/`. The contracts package is the canonical source.
- **Never** edit `contracts/src/generated/`. Regenerate via the appropriate codegen step instead.
- **Never** bypass contracts for a cross-service shape "just for now" — the drift never gets fixed.
