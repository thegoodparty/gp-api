# Getting started

## Prerequisites

- Node 22.12.0 (enforced by `.nvmrc` and `package.json` engines)
- Docker (for local Postgres via `docker compose`) — or a local Postgres install
- `nvm` recommended

## Quickstart

```bash
nvm use
npm run setup
```

`npm run setup` runs `npm ci`, copies `.env.example` to `.env` if missing, starts Postgres via docker-compose, and runs `npm run migrate:reset` (which creates tables + seeds).

Fill in real values for required vendor keys in `.env` before starting the API (see `docs/team-setup.md`). Then:

```bash
npm run start:dev
```

API boots on `:3000`. Swagger is at `http://localhost:3000/api`.

## Common commands

| Task                                   | Command                                   |
| -------------------------------------- | ----------------------------------------- |
| Verify a change (lint + types + tests) | `npm run verify`                          |
| Run a single test file                 | `npx vitest run src/path/to/file.test.ts` |
| Apply a new migration                  | `npm run migrate:dev`                     |
| Reset local DB                         | `npm run migrate:reset`                   |
| Regenerate Prisma client + route types | `npm run generate`                        |
| Diff infra for an env                  | `npm run infra diff dev`                  |

## Related docs

- `CLAUDE.md` — the canonical agent/contributor guide (kept short, commands first)
- `docs/writing-tests.md` — testing patterns and when to reach for each
- `docs/observability.md` — Grafana alerts, Loki, Tempo
- `docs/debugging.md` — reproducing bugs with `useTestService`
- `docs/contracts.md` — working with `@goodparty_org/contracts`
- `docs/team-setup.md` — deeper setup (nvm, npm ci flags, IDE config)
