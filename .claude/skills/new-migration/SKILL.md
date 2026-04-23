---
name: new-migration
description: Create a new Prisma migration safely against the modular schema. Use when adding/changing a column, table, index, or enum in gp-api. Never edit applied migration SQL.
---

# New migration

Schema is split across `prisma/schema/<topic>.prisma` files. Prisma stitches them at generate-time.

## 1. Edit the right schema file

| Topic                        | File                                                         |
| ---------------------------- | ------------------------------------------------------------ |
| Campaign / candidate         | `prisma/schema/campaign.prisma`                              |
| Campaign positions           | `prisma/schema/campaignPosition.prisma`                      |
| Campaign tasks               | `prisma/schema/campaignTask.prisma`                          |
| Campaign plan / plan version | `prisma/schema/campaignPlan*.prisma`                         |
| AI chat                      | `prisma/schema/aiChat.prisma`                                |
| User / org / membership      | `prisma/schema/user.prisma` (etc.)                           |
| One-off / unsure             | grep for the model first: `grep -r "model X" prisma/schema/` |

Pick the file that already declares the related model. Don't introduce a new schema file unless the topic is genuinely new.

## 2. JSON columns get a generated type sidecar

If the column is `Json`, the corresponding `<topic>.jsonTypes.d.ts` file declares the TS shape. Update both in lockstep.

## 3. Generate and apply locally

```bash
npm run migrate:dev
```

Prompts for a migration name. Use a short snake_case verb-phrase: `add_campaign_status`, `index_voter_zip`. Avoid `wip`, `ugh`, blank, or unscoped names.

This runs:

1. `prisma migrate dev` — diffs schema, writes `prisma/schema/migrations/<timestamp>_<name>/migration.sql`, applies to local DB.
2. `prisma generate` — regenerates the client + route types.

## 4. Review the generated SQL

Open `prisma/schema/migrations/<timestamp>_<name>/migration.sql`. Look for:

- Implicit `DROP COLUMN` (data loss).
- New `NOT NULL` column on a populated table without a default — will fail in dev/prod.
- Table renames (Prisma generates them as DROP + CREATE — not what you want; use `@@map`).
- Indexes on huge tables — use `CREATE INDEX CONCURRENTLY` by hand (Prisma does not).

If the generated SQL is wrong, edit it **before** committing the migration. Once it's been applied to a shared environment it's immutable (see "Never" below).

## 5. Test against the new schema

```bash
npm run verify
```

If your migration changes a column an integration test exercises, also rerun that test with a fresh DB:

```bash
npm run migrate:reset    # LOCAL ONLY — drops + reseeds local DB
npx vitest run path/to/affected.test.ts
```

## 6. Commit

The migration directory and the schema change go together in a single commit. Don't split them.

## Never

- **Never** edit `prisma/schema/migrations/<timestamp>/migration.sql` after it has been applied to a shared environment. Add a follow-up migration instead.
- **Never** run `npm run migrate:reset` against anything but a local DB.
- **Never** run `npx prisma migrate deploy` from your machine — that's CI's job.
- **Never** leave migrations with empty / unscoped names (`20241203001012_`, `20241203192227_ugh`). They make `git log` and rollback investigations miserable.
