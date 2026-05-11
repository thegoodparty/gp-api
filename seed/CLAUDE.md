# Seed

Development and CSV seed data. Two distinct flows:

1. **Factory seeds** — generated via `@faker-js/faker`-style factories under `factories/`. Local dev only (`development` `NODE_ENV` with `SKIP_MTFCC_SEED`).
2. **CSV seeds** — reference data (MTFCC codes, offices) loaded from `data/*.csv`. Run in dev / qa / prod.

Entry point is `seed/seed.ts`. `npm run migrate:reset` invokes it after wiping the DB.

## Key files

| Path                    | Purpose                                                                        |
| ----------------------- | ------------------------------------------------------------------------------ |
| `seed.ts`               | Orchestrator; chooses CSV-only vs. CSV-and-factory based on `NODE_ENV` + flags |
| `users.ts`              | Factory seed for `User` rows; exports `ADMIN_USER`, `SERVE_USER` constants     |
| `campaigns.ts`          | Factory seed for campaigns + linked org                                        |
| `topIssues.ts`          | Static list of top issues                                                      |
| `websiteData.ts`        | Per-campaign website seed data                                                 |
| `mtfcc.ts`              | Loads `data/mtfcc.csv` (Census MAF/TIGER feature class codes)                  |
| `offices.ts`            | Loads office reference data                                                    |
| `contentful.ts`         | Mirrors a snapshot of Contentful entries into the DB                           |
| `fixedCampaigns.json`   | Pinned campaigns used by integration tests for stable IDs                      |
| `scenarios.ts`          | One-off scenario scripts: `npx tsx seed/scenarios.ts pro\|demo\|freeTexts`     |
| `factories/`            | Per-model factories (`campaign.factory.ts`, `user.factory.ts`, etc.)           |
| `factories/generate.ts` | Faker wrapper / per-factory shared helpers                                     |
| `data/`                 | CSV reference data (MTFCC, election types, geo entities)                       |
| `util/`                 | Helpers (e.g. `seedEcanvasserDemoAccount.util.ts`)                             |

## Patterns

- **CSV seeds run unconditionally in dev/qa/prod**; factory seeds run only with `NODE_ENV=development` and `SKIP_MTFCC_SEED=true`. This prevents fake users from leaking into hosted envs.
- **Factories return Prisma create input**, not saved rows. The caller decides whether to `create` or batch.
- **`fixedCampaigns.json`** holds known IDs/slugs used by tests and demo flows — treat it as a contract, not a sample. Adding a campaign here is a code change, not a data change.
- **Scenarios are CLI-arg driven**: `seed/scenarios.ts <name>`. Add a new branch in the `switch` instead of adding a new file when possible.

## Gotchas

- **`IS_PREVIEW=true`** flips the seed path: factory seeds run even in production-mode containers so PR preview envs have data. Don't put expensive seeds in the factory path without checking the preview impact.
- **`getTypeArg()` parses `process.argv`** — running `seed.ts` programmatically from another script needs to set `argv` carefully or call helpers directly.
- **Contentful seed depends on live API access.** It'll silently no-op if creds are missing; check the logs if your local DB is missing CMS-derived rows.
- **CSV files in `data/` are large** and committed to git — don't regenerate them casually. They're authoritative reference data, not derived.
- `hashPasswordSync` is used in seed for speed; production code uses the async variant. Don't copy the sync version into `src/`.
