<p align="center">
  <a href="https://goodparty.org" target="blank"><img src="https://goodparty.org/images/logo-hologram-white.svg" width="120" alt="GoodParty.org Logo" /></a>
</p>

# gp-api

The GoodParty.org API. NestJS on Fastify, Prisma on Postgres, deployed to ECS Fargate via Pulumi.

## Quickstart

```bash
nvm use
npm run setup       # npm ci + .env + docker compose + migrate:reset
npm run start:dev   # boots on :3000
```

Edit `.env` with vendor keys before the first `start:dev` (see `docs/team-setup.md` for what's required vs optional).

Swagger UI: <http://localhost:3000/api>. OpenAPI JSON: <http://localhost:3000/api-json>.

## Common commands

| Task                          | Command                                   |
| ----------------------------- | ----------------------------------------- |
| Verify a change               | `npm run verify`                          |
| Run a single test file        | `npx vitest run src/path/to/file.test.ts` |
| Apply a new migration         | `npm run migrate:dev`                     |
| Reset local DB                | `npm run migrate:reset`                   |
| Regenerate Prisma + routes    | `npm run generate`                        |
| Diff infra changes for an env | `npm run infra diff <dev\|qa\|prod>`      |

## Docs

- `CLAUDE.md` / `AGENTS.md` — agent-and-contributor guide. Start here.
- `docs/getting-started.md` — fuller setup, IDE config, Postgres-without-docker
- `docs/architecture.md` — module shape, auth chain, queue, cross-service map
- `docs/contracts.md` — `@goodparty_org/contracts` workflow
- `docs/observability.md` — alerting, Loki, Tempo
- `docs/debugging.md` — repro recipes
- `docs/team-setup.md` — Node, npm, peer-deps notes
- `docs/postman-testing.md`, `docs/postman-ci-checklist.md` — Postman workflow
- `docs/adr/` — Architecture Decision Records

## Deployment

Pulumi-managed ECS Fargate. CLI: `npm run infra`. Examples:

```bash
npm run infra diff dev
npm run infra deploy dev
```

You'll need to be authenticated via the AWS CLI before running `infra` commands.

## AI-assisted development

We use Claude Code and other agents. Project context lives in `CLAUDE.md` (and `AGENTS.md`, a symlink). If you find yourself teaching the AI the same thing twice, add it there so all future sessions benefit.

## License

[CC0-1.0](./LICENSE.md).
