# RFC: Reducing Backend Operational Tax

## Status: Draft

## Problem Statement

Our backend is split across 4+ repositories (gp-api, people-api, election-api, gp-sdk, with campaign-plan-service incoming). This structure is costing us measurable engineering time through duplicated work, version drift, and coordination overhead — without providing meaningful architectural benefits in return.

This doc proposes three options, evaluates each against concrete data, and recommends one.

## The Cost We're Paying Today

### Duplicated infrastructure work: ~30 PRs in 6 months

Between September 2025 and March 2026, at least 30 merged PRs across our repos were duplicative cross-repo infrastructure work. Highlights:

| Work Item                      | gp-api PRs       | people-api PRs | election-api PRs | Total  |
| ------------------------------ | ---------------- | -------------- | ---------------- | ------ |
| Pulumi migration               | ~15              | 4              | 2                | **21** |
| Dependabot config              | 1                | 1              | 1                | **3**  |
| Deployment circuit breaker fix | 1                | 1              | 1                | **3**  |
| Vitest setup                   | (already had it) | 1              | 1                | **2**  |
| Prod deploy coordination       | 4                | 3              | 1                | **8**  |

The Pulumi migration is the starkest example: one engineer authored 21 PRs across three repos to achieve the same outcome (migrate from SST to Pulumi). The core deployment logic is ~70% identical between repos. In a single repo, this would have been ~8 PRs.

The Dependabot configuration is the simplest example: 3 identical PRs, same author, same day (Feb 10), with the PR description copy-pasted verbatim across all three repos.

The deployment circuit breaker fix is the most concerning example: a production-impacting deployment bug required 3 separate PRs on the same day. The people-api and election-api PRs literally just say "See gp-api #1230." A bug that should have been a one-line fix in one place required three PRs, three reviews, and three deployments.

### Version drift is already happening

Despite these repos being created within months of each other, dependency versions have already diverged:

| Dependency    | gp-api  | people-api | election-api |
| ------------- | ------- | ---------- | ------------ |
| TypeScript    | 5.6.3   | 5.9.3      | 5.8.2        |
| Prisma        | 6.3.0   | 6.5.0      | 6.4.1        |
| Pulumi AWS    | ~6.67.0 | ^7.17.0    | ^7.17.0      |
| Pino (nestjs) | 4.6.0   | 4.4.1      | 4.6.0        |

This drift has real consequences: a security patch or breaking change in any of these dependencies must now be evaluated and applied independently in each repo. With Dependabot now active in all three repos, every dependency update generates 3 separate PRs to review and merge. Over the course of a year, this will add up to hundreds of redundant Dependabot PRs.

The Pulumi AWS version split (6.x vs 7.x) is especially notable — our primary infrastructure tool is on different major versions across repos, meaning infrastructure code that works in one repo may not work in another.

### Duplicated boilerplate: 95% identical in key areas

A code-level audit found massive duplication in non-application code:

| Component                     | Duplication | Details                                                                                                                                          |
| ----------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| OpenTelemetry setup (otel.ts) | **95%**     | Identical file in all three repos, including the same custom `JsonBodyLogRecordProcessor` and the same comment about Grafana cardinality pricing |
| Fastify configuration         | **85%**     | Same plugins, same versions, same setup patterns                                                                                                 |
| Dockerfiles                   | **90%**     | people-api and election-api Dockerfiles are near-identical multi-stage builds                                                                    |
| CI/CD workflows               | **75%**     | Node setup, Docker build, ECR push, Pulumi deploy, Slack notifications — all copied                                                              |
| Prisma configuration          | **80%**     | Same generators, datasource config, migration patterns                                                                                           |
| Exception filters             | **50%**     | Similar patterns, slightly different implementations                                                                                             |

Each of these represents a surface area where a bug fix, improvement, or config change must be applied N times.

### Coordination overhead compounds with each new service

Releases that span services must be coordinated manually. On Feb 2 and Feb 12, we had "prod deploy" PRs merged on the same day across multiple repos — suggesting releases that required touching multiple repos in sequence. Each new service (campaign-plan-service is incoming) multiplies this coordination cost linearly.

We currently lack the ops tooling (release trains, cross-repo CI, service mesh, contract testing) that organizations typically use to manage multi-service deployments safely. This isn't a criticism — building that tooling is a significant investment that we should only make if the multi-service architecture is providing commensurate value.

## Options

### Option A: Shared npm packages

Invest in extracting shared code into npm packages that all repos consume.

**We've already started down this path.** The `@goodparty_org/contracts` package exists in gp-api's `contracts/` directory, published via changesets with RC versioning on PRs. The `gp-sdk` repo was created Jan 29, 2026 and already has 53 PRs — roughly half of which are automated `chore: release` changesets PRs.

**What it solves:**

- Type/schema sharing between frontend and backend (contracts package)
- Could extend to shared infra code (OTel config, exception filters, Prisma base classes)

**What it doesn't solve:**

- CI/CD duplication — each repo still needs its own workflows, Dockerfiles, and deploy scripts
- IaC duplication — Pulumi components would need their own package, versioning, and release cycle
- Coordination overhead — releases still happen independently per repo
- Dependabot multiplier — still N repos x M dependency updates

**What it costs:**

- Package versioning overhead. The gp-sdk repo demonstrates this concretely: in its first month, it accumulated 53 PRs, 26 of which were automated `chore: release` version bumps. On Feb 26 alone, there were **5 release PRs** as the team iterated on a CJS compatibility fix for the contracts package. Each change to shared code requires: update the package -> publish -> bump the version in each consumer -> verify nothing broke.
- New infrastructure to maintain. The contracts package required setting up tsup bundling, changeset automation, npm OIDC trusted publishing (which took 4 PRs to get working — PRs #7-#11 in gp-sdk), and CI gating logic in gp-api's workflow.
- CJS/ESM compatibility issues. PR #46-#49 in gp-sdk show a CJS compatibility fix that required 4 PRs across 2 days to resolve — the kind of packaging problem that doesn't exist when code is co-located.
- Learning curve. The team must understand changesets, semantic versioning, npm publishing, and the RC/snapshot workflow. This is tooling knowledge that serves the packaging system, not the product.

**Assessment:** npm packages are the right solution for sharing types and schemas with **external consumers** (the frontend, third-party integrations). They are a high-overhead solution for sharing code between backends that we control and deploy ourselves.

### Option B: Monorepo (recommended)

Consolidate all backend repos into a single repository, using a workspace tool (e.g., nx, turborepo, or npm workspaces) to manage multiple packages/services.

**What it solves:**

- **All duplicated infrastructure becomes shared.** OTel config, Dockerfiles, CI/CD, Pulumi components, exception filters, Prisma configuration — all exist once and are consumed by each service as workspace dependencies.
- **Version drift becomes impossible.** One package.json (or coordinated workspace package.jsons) means one version of TypeScript, one version of Prisma, one version of Pulumi. Dependabot generates one PR, not three.
- **Bug fixes land once.** The circuit breaker fix would have been one PR touching one file, reviewed once, deployed everywhere.
- **CI/CD is unified.** One workflow that builds and deploys affected services. No cross-repo coordination for releases.
- **Atomic changes across services.** A schema change that affects both gp-api and election-api can land in a single PR with a single review, rather than requiring coordinated changes across repos.

**What it costs:**

- Migration effort. Moving repos into a monorepo requires careful git history preservation, CI/CD rework, and team coordination. This is a one-time cost.
- Repo complexity. The repository will be larger, and developers working on one service will see code for other services. Workspace tooling (nx, turborepo) and CODEOWNERS can manage this, but it's a real tradeoff.
- Build/CI time. Without caching and affected-service detection, CI runs could get slower. Workspace tools solve this well, but it's configuration that must be set up and maintained.

**What it preserves:**

- **Service boundaries.** Each service remains its own deployable unit with its own Prisma schema, its own NestJS application, and its own ECS service. Teams can still own specific services. A monorepo is a code organization strategy, not an architecture change.
- **Independent deployability.** With workspace tooling, changes to election-api don't trigger a gp-api deployment. Services deploy independently based on what changed.
- **The contracts package.** `@goodparty_org/contracts` continues to exist and publish to npm for external consumers (gp-webapp, gp-sdk). It just lives in the monorepo workspace alongside the services that produce its types.

**Proposed structure:**

```
goodparty-backend/
  packages/
    shared/              # OTel, exception filters, Prisma base, logging
    infra/               # Pulumi components, Dockerfile templates
    contracts/           # @goodparty_org/contracts (published to npm)
  services/
    gp-api/              # Existing gp-api application
    people-api/          # Existing people-api application
    election-api/        # Existing election-api application
    campaign-plan-service/  # New service, starts here from day one
  deploy/
    shared/              # Shared CI/CD, deploy scripts
```

**Assessment:** This directly eliminates the duplication tax, prevents version drift, and reduces coordination overhead. It does not require changing our service architecture. The migration is real work, but it's bounded, one-time work — unlike the ongoing tax of the current setup which compounds with each new service.

### Option C: Status quo (do nothing)

Keep the current multi-repo structure and accept the operational overhead.

**What it solves:**

- No migration cost or disruption to current workflows.

**What it costs:**

- The 30+ duplicative PRs per 6-month period continues and grows with each new service.
- Version drift continues and accelerates (TypeScript is already on 3 different versions).
- Every Dependabot update generates N PRs (currently 3, soon 4+).
- Every infra improvement or bug fix must be applied N times.
- Cross-service releases remain manually coordinated.
- Each new service requires copying and adapting boilerplate from an existing repo, then maintaining it independently forever.

**Assessment:** The costs are manageable today at 3 repos. They become increasingly painful at 4-5+ repos, especially as we add Dependabot (which multiplies PR volume) and as version drift makes cross-repo fixes harder. The longer we wait, the more divergent the repos become and the harder consolidation gets.

## Recommendation

**Option B: Monorepo.** It directly addresses every measured problem:

| Problem                               | npm packages     | Monorepo                           | Status quo        |
| ------------------------------------- | ---------------- | ---------------------------------- | ----------------- |
| Duplicated IaC (21 Pulumi PRs)        | Does not solve   | Solves                             | Continues         |
| Duplicated CI/CD                      | Does not solve   | Solves                             | Continues         |
| Version drift (3 TS versions)         | Partially solves | Solves                             | Worsens           |
| Dependabot multiplier                 | Does not solve   | Solves                             | Worsens (4x soon) |
| Bug fix propagation (circuit breaker) | Does not solve   | Solves                             | Continues         |
| Cross-service release coordination    | Does not solve   | Solves                             | Continues         |
| Type sharing with frontend            | Solves           | Solves (contracts still publishes) | Does not solve    |
| Package versioning overhead           | Introduces it    | Eliminates for internal code       | N/A               |

npm packages solve the type-sharing problem well. They should continue to exist for that purpose. But they don't address the majority of our operational overhead, which is in infrastructure, CI/CD, and deployment duplication. A monorepo solves all of these while also being the natural home for the contracts package.

## Migration Approach (High-Level)

If this is accepted, a detailed migration plan would follow. At a high level:

1. **Set up the monorepo workspace** with nx or turborepo. Establish the shared package structure.
2. **Move election-api first** (smallest repo, 51 PRs in 6 months, lowest risk). Validate the workflow.
3. **Move people-api second.** At this point, shared infra packages prove their value.
4. **Move gp-api last** (largest repo, most active). By now the patterns are established.
5. **campaign-plan-service starts in the monorepo from day one**, avoiding another round of boilerplate duplication.

Each step is independently valuable — even if we only move 2 of 3 repos, we've reduced duplication.

## Open Questions

- **Workspace tooling preference?** nx, turborepo, and plain npm workspaces all work. Turborepo is lightest-weight; nx has the most features. Worth a spike.
- **Git history preservation?** We can merge repos preserving full git history with `git subtree` or similar. Worth confirming the approach.
- **CODEOWNERS / review boundaries?** If teams want to maintain ownership boundaries within the monorepo, GitHub CODEOWNERS supports path-based rules.
