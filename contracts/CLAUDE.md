# Contracts (`@goodparty_org/contracts`)

Public npm package: shared Zod schemas and TypeScript types consumed by `gp-api`, `@goodparty_org/sdk`, and `gp-admin`. Lives **inside** the `gp-api` repo and is built as part of the API build, but is published independently.

Anything that crosses a service boundary (request/response shapes, public enums) belongs here. ADR / detailed guide: `docs/contracts.md`.

## Key files

| Path                        | Purpose                                                                       |
| --------------------------- | ----------------------------------------------------------------------------- |
| `package.json`              | npm metadata; `name: "@goodparty_org/contracts"`, dual CJS/ESM build via tsup |
| `tsup.config.ts`            | Build config — emits `dist/index.{js,mjs,d.ts}`                               |
| `src/index.ts`              | Public surface; everything reachable from here is exported                    |
| `src/<feature>/`            | Per-domain schemas (`campaigns/`, `users/`, `elections/`, `ecanvasser/`)      |
| `src/shared/`               | Cross-domain primitives (pagination, enums, util types)                       |
| `src/generated/`            | Output of `scripts/generate-enums.ts` (Prisma → Zod enum mirrors)             |
| `scripts/generate-enums.ts` | Generates Zod enums from Prisma enums to keep them in sync                    |
| `CHANGELOG.md`              | Human-edited changelog (manually maintained per release)                      |
| `dist/`                     | Build output, committed only via npm publish workflow                         |

## Patterns

- **Build pipeline is two stages**: `npm run generate-enums` → `tsup`. Both run via `npm run build`. `scripts/build-contracts.ts` at the repo root short-circuits when the source is older than `dist/index.js`.
- **Prisma enums are the source of truth for enum values** — never hand-write a Zod enum that mirrors a Prisma one; let `generate-enums.ts` do it. Add the Prisma enum first, then regenerate.
- **Adding a public schema**: create the Zod schema in `src/<feature>/`, export from `src/<feature>/index.ts`, then re-export from `src/index.ts`. If it isn't reachable from the root index, it doesn't ship.
- **Versioning is manual.** Bump `package.json` version + write a `CHANGELOG.md` entry in the same PR that changes the public surface.
- The contracts build runs automatically on `npm run start:dev`, `npm run build`, and `npm test` — you generally don't run `cd contracts && npm run build` by hand.

## Gotchas

- **Never bypass `@goodparty_org/contracts` for cross-service shapes** (root `CLAUDE.md`, "Never" list). Don't redeclare a schema in `gp-api/src/` if it's already in contracts.
- **Don't use `.passthrough()` on input schemas** (Rule from root `CLAUDE.md`). Use `.strict()` or the default behaviour.
- The published `dist/` should never be edited by hand — it's regenerated on every build.
- `gp-sdk` and `gp-admin` import from this package over npm, not via a path alias. A breaking change here ripples across repos — coordinate via Changesets and bump the version intentionally.
- `provenance: true` is set in `publishConfig`; the publish workflow needs OIDC creds to succeed.
