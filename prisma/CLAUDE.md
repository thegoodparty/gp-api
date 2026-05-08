# Prisma

Postgres schema, migrations, and the Prisma client surface. Schema is split per-model under `schema/` (Prisma's multi-file schema feature). Migrations are immutable once applied.

## Key files

| Path                                    | Purpose                                                                             |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| `schema/schema.prisma`                  | Generators (`prisma-client-js`, `prisma-json-types-generator`) and datasource       |
| `schema/<model>.prisma`                 | One file per model (`campaign.prisma`, `organization.prisma`, etc.)                 |
| `schema/migrations/<timestamp>_<name>/` | Applied migrations — **never edit, never delete**                                   |
| `schema/migrations/migration_lock.toml` | Prisma's lock — committed                                                           |
| `schema/<model>.jsonTypes.d.ts`         | Hand-maintained TS types for `Json` columns (avoid creating new ones — see Rule 25) |

## Patterns

- **One model per file.** When adding a model, create `schema/<modelName>.prisma`. Don't append to `schema.prisma`.
- **The PrismaBase pattern is mandatory** for services backed by a model — see root `CLAUDE.md` and `docs/adr/0001-prisma-base-pattern.md`.
- **Migrations**: `npm run migrate:dev` creates and applies one locally. `npm run migrate:reset` wipes the local DB and re-seeds. Never run reset against a non-local database.
- **Pending-migration check** runs on every `npm run start:dev` via `scripts/check-pending-migrations.ts`. If you see the yellow warning banner, run `migrate:dev` before continuing.
- **`prisma-json-types-generator`** turns `Json` columns into typed fields if you have a matching `<model>.jsonTypes.d.ts` and a `///` comment annotation in the `.prisma` file (e.g. `/// [CampaignData]`). The generator is run as part of `npm run generate`.

## Gotchas

- **Migrations are immutable.** Editing a file in `schema/migrations/<timestamp>/` after it's been applied will desync prod from dev. If you need to fix a bad migration, write a new one.
- **`map:` and snake_case** — DB columns are `snake_case`, Prisma fields are `camelCase`, joined by `@map()`. Match the existing style on adjacent fields when adding columns.
- **`Json` columns are an anti-pattern** for known-shape data (Rule 25). Several legacy models (`Campaign.data`, `Campaign.details`, `Campaign.aiContent`) use them — don't replicate that for new models. Prefer proper columns or relations.
- **Don't bypass `npm run generate`.** `prisma generate` alone misses the route-types step (`scripts/generate-route-types.ts`) that the `generate` script also runs.
- `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]` is set so the same `node_modules/.prisma` works in the Alpine Docker image — keep it.
