# 0005 — Shared contracts package

Status: accepted

## Context

`gp-webapp` and `gp-sdk` need request/response types and Zod schemas that match gp-api exactly. Three options:

1. Each consumer redeclares the shapes (drift guaranteed)
2. Generate an OpenAPI spec from the API and have consumers code-gen against it
3. A shared npm package owned by gp-api, consumed by everyone

## Decision

Option 3. The `contracts/` directory is an npm workspace published as `@goodparty_org/contracts`. It contains Zod schemas (which produce both runtime validators and TS types via `z.infer`) and re-exports generated Prisma enums.

Builds via `tsup`. Auto-built as part of `npm run start:dev` and `npm run build` via `scripts/build-contracts.ts`.

## Process

- Changes to `contracts/src/` require a changeset (`npx changeset` from `contracts/`).
- CI gate at `.github/workflows/main.yml` detects diffs in `contracts/src/` and gates publishing.
- `develop` and `qa` branches commit snapshot versions; `master` triggers npm publish.

## Known gap

The most-used campaign shapes (`CampaignSchema.data`, `details`, `aiContent`) are still typed as `z.record(z.string(), z.unknown())` in contracts. The real shape lives in `gp-api/src/campaigns/schemas/updateCampaign.schema.ts`. Migrating it is a multi-PR refactor coordinated with gp-webapp consumers.

## Consequences

- One source of truth for cross-service shapes.
- Adding a new shared shape costs: edit contracts, build, changeset, import in consumers. Documented as a workflow in `docs/contracts.md`.
