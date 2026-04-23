# Contracts package (`@goodparty_org/contracts`)

Shared Zod schemas and TypeScript types consumed by `gp-sdk` and other clients. Source lives in `contracts/` (npm workspace). Builds via `tsup`.

## When you change a contract

1. Edit `contracts/src/...`.
2. From `contracts/`, add a changeset:
   ```bash
   cd contracts && npx changeset
   ```
3. From the repo root, build contracts (also runs automatically as part of `npm run start:dev` and `npm run build`):
   ```bash
   npm run build:contracts
   ```
4. Commit the changeset file with your PR.

## When you change a Prisma enum

Enums are re-exported from `contracts/src/generated/enums.ts`. After editing a Prisma schema:

```bash
npm run generate     # regenerates Prisma client
npm run build:contracts
```

## Publishing

- `develop` and `qa` produce snapshot versions (committed, not published).
- `master` triggers a `changesets/action` "Version Packages" PR. Merging that PR publishes to npm.

## Local linking against gp-sdk

```bash
cd contracts && npm run build
cd ~/dev/good-party/gp-sdk
npm link ../gp-api/contracts
```

Run `npm run dev` in both `contracts/` and `gp-sdk/` for live rebuild chaining.

## Known gap

`CampaignSchema.data`, `details`, and `aiContent` (in `contracts/src/campaigns/Campaign.schema.ts`) are typed as `z.record(z.string(), z.unknown())`. The real shape lives in `gp-api/src/campaigns/schemas/updateCampaign.schema.ts`. Migrating it into contracts is a known refactor — coordinate with `gp-webapp` consumers before doing it.
