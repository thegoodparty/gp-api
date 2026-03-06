# RFC: Reducing Backend Operational Tax

## Status: Draft

## Problem Statement

Our backend is split across multiple repositories (gp-api, people-api, election-api, with more on the way). This structure is costing us measurable engineering time through duplicated work, version drift, and coordination overhead — without providing meaningful architectural benefits in return.

This doc proposes three options, evaluates each against concrete data, and recommends one.

## The Cost We're Paying Today

### Duplicated infrastructure work: ~30 PRs in 6 months

Between September 2025 and March 2026, at least 30 merged PRs across our repos were duplicative cross-repo infrastructure work:

| Work Item                      | gp-api PRs       | people-api PRs | election-api PRs | Total  |
| ------------------------------ | ---------------- | -------------- | ---------------- | ------ |
| Pulumi migration               | ~15              | 4              | 2                | **21** |
| Dependabot config              | 1                | 1              | 1                | **3**  |
| Deployment circuit breaker fix | 1                | 1              | 1                | **3**  |
| Vitest setup                   | (already had it) | 1              | 1                | **2**  |
| Prod deploy coordination       | 4                | 3              | 1                | **8**  |

The Pulumi migration illustrates the structural problem clearly: because our infrastructure code is ~70% identical across repos but lives in three separate places, migrating from SST to Pulumi required ~21 PRs across three repos. The work was done sequentially — gp-api first (Jan 15–29), then election-api (Feb 4), then people-api (Mar 2) — creating a 6-week window where our repos were running different IaC systems. In a shared codebase, the core migration would have been done once with per-service configuration layered on top.

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

| Component                        | Duplication | Details                                                                                                                                          |
| -------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| OpenTelemetry setup (otel.ts)    | **95%**     | Identical file in all three repos, including the same custom `JsonBodyLogRecordProcessor` and the same comment about Grafana cardinality pricing |
| Fastify configuration            | **85%**     | Same plugins, same versions, same setup patterns                                                                                                 |
| Dockerfiles                      | **90%**     | people-api and election-api Dockerfiles are near-identical multi-stage builds                                                                    |
| CI/CD workflows                  | **75%**     | Node setup, Docker build, ECR push, Pulumi deploy, Slack notifications — all copied                                                              |
| Pulumi IaC (`deploy/` directory) | **70%**     | Core ECS service component is structurally identical; ~1,300 lines duplicated across repos (663 in people-api + 655 in election-api)             |
| Prisma configuration             | **80%**     | Same generators, datasource config, migration patterns                                                                                           |
| Exception filters                | **50%**     | Similar patterns, slightly different implementations                                                                                             |

Each of these represents a surface area where a bug fix, improvement, or config change must be applied N times.

### Coordination overhead compounds with each new service

Releases that span services must be coordinated manually. On Feb 2 and Feb 12, we had "prod deploy" PRs merged on the same day across multiple repos — suggesting releases that required touching multiple repos in sequence. Each new service multiplies this coordination cost linearly.

We currently lack the ops tooling (release trains, cross-repo CI, service mesh, contract testing) that organizations typically use to manage multi-service deployments safely. This isn't a criticism — building that tooling is a significant investment that we should only make if the multi-service architecture is providing commensurate value.

## Options

### Option A: Shared npm packages

Invest in extracting duplicated backend code into npm packages that all repos consume.

**What it solves:**

- Type/schema sharing between frontend and backend
- Could extend to shared infra code (OTel config, exception filters, Prisma base classes)

**What it doesn't solve:**

- CI/CD duplication — each repo still needs its own workflows, Dockerfiles, and deploy scripts
- IaC duplication — Pulumi components would need their own package, versioning, and release cycle
- Coordination overhead — releases still happen independently per repo
- Dependabot multiplier — still N repos x M dependency updates

**What it costs:**

Scaling npm-based code sharing to cover all our duplicated infrastructure would require creating and maintaining several internal packages (OTel config, Pulumi components, exception filters, Prisma base classes, Docker templates). Each package introduces ongoing costs:

- **Version propagation overhead.** Every change to a shared package requires a publish cycle, then a version bump in every consuming repo, then verification that nothing broke. For tightly-coupled infrastructure code (e.g., a Pulumi component used by all services), this creates a slow feedback loop: change the package, publish, update 3+ consumers, and hope the integration works. The alternative — pinning shared packages to `latest` — sacrifices reproducibility.
- **Transitive dependency management.** Shared packages that depend on NestJS, Prisma, or Pulumi must keep their peer dependency ranges aligned with every consumer. When gp-api upgrades NestJS, the shared packages must be updated and republished before the upgrade can land. This creates coupling without co-location — the worst of both worlds.
- **Packaging infrastructure.** Each shared package needs its own build system, release automation, and CI pipeline. We've already seen the cost of this: setting up npm publishing with OIDC, changeset automation, and CJS/ESM compatibility is non-trivial work that serves the packaging system rather than the product.
- **Where do you pin shared dependencies?** If NestJS, Prisma, and TypeScript versions should be consistent across services (and they should — see the version drift table above), someone has to decide where the canonical version lives. With npm packages, this is an unsolved governance problem. Each repo can still drift independently.

**Assessment:** npm packages are the right solution for sharing types and schemas with **external consumers** (the frontend, third-party integrations). They are a high-overhead solution for sharing code between backends that we control and deploy ourselves. The existing `@goodparty_org/contracts` package and `gp-sdk` are great examples of npm publishing done right — they serve external consumers who need a stable, versioned API. This proposal does not replace that work; it addresses a different problem (internal infrastructure duplication) that npm publishing is not well-suited to solve.

### Option B: Monorepo

Consolidate all backend repos into a single repository using npm workspaces.

**To be clear: this does not mean merging services into a single application.** Each service (gp-api, people-api, election-api) remains its own NestJS application, its own Prisma schema, its own Docker image, and its own ECS deployment. The services continue to be deployed separately. What changes is that they share a single repository, a single CI/CD pipeline, and a single set of infrastructure code. This is a code organization change, not an architecture change.

**What it solves:**

- **All duplicated infrastructure becomes shared.** OTel config, Dockerfiles, CI/CD, Pulumi components, exception filters, Prisma configuration — all exist once and are consumed by each service as workspace dependencies.
- **Version drift becomes impossible.** A single root package.json controls shared dependency versions. Dependabot generates one PR, not three.
- **Bug fixes land once.** The circuit breaker fix would have been one PR touching one file, reviewed once, deployed everywhere.
- **CI/CD is unified.** One workflow builds and deploys all affected services. No cross-repo coordination for releases.
- **Atomic changes across services.** A schema change that affects both gp-api and election-api can land in a single PR with a single review, rather than requiring coordinated changes across repos.

**What it costs:**

- **Migration effort.** Moving repos into a monorepo requires git history preservation, CI/CD rework, and team coordination. This is a one-time cost, and the scope is bounded: estimated at roughly 1 week of focused effort given the similarity of the existing infrastructure.
- **Repo size.** The combined codebase is not as large as it might seem. gp-api is ~48K lines of application code. people-api and election-api add ~6K lines combined. After eliminating duplicated boilerplate (~2,500 lines of deploy code, ~900 lines of CI/CD, and ~1,200 lines of shared infra like OTel/filters), the net new code introduced by consolidation is approximately **4,000 lines of unique application logic** from people-api and election-api. The repo gets bigger, but not dramatically so — and GitHub CODEOWNERS can maintain clear ownership boundaries by path.
- **CI run time.** Individual CI runs will take longer, since a single pipeline now builds and tests multiple services. However, the **overall time from code change to production** gets faster: today, a cross-service change requires sequential PRs across repos, each with its own CI run, review, and merge cycle. In a monorepo, that's one PR, one CI run, one review.

**What it preserves:**

- **Service boundaries.** Each service remains its own deployable unit with its own Prisma schema, its own NestJS application, and its own ECS service. A monorepo is a code organization strategy, not an architecture change.
- **The contracts package.** `@goodparty_org/contracts` continues to exist and publish to npm for external consumers (gp-webapp, gp-sdk). It just lives in the monorepo workspace alongside the services that produce its types — which actually makes it easier to keep in sync.

**Proposed structure:**

```
<repo>/
  packages/
    shared/              # OTel, exception filters, Prisma base, logging
    infra/               # Pulumi components, Dockerfile templates
    contracts/           # @goodparty_org/contracts (published to npm)
  services/
    gp-api/              # Existing gp-api application
    people-api/          # Existing people-api application
    election-api/        # Existing election-api application
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

npm packages solve the type-sharing problem well and should continue to exist for that purpose. But they don't address the majority of our operational overhead, which is in infrastructure, CI/CD, and deployment duplication. A monorepo solves all of these while also being the natural home for the contracts package.

Beyond the direct problem-solving, a monorepo aligns with our team's capabilities. We are a small team without deep infrastructure or ops specialization — and that's fine. But multi-repo microservices require exactly that specialization: cross-repo CI orchestration, shared library versioning strategies, coordinated release management. Every hour we spend building and maintaining that tooling is an hour not spent on the product. A monorepo dramatically reduces the surface area of ops knowledge our team needs to maintain, letting us focus engineering effort where it has the most product impact.

## Migration Approach (High-Level)

If this is accepted, a detailed migration plan would follow. The estimated effort is **~1 week** given the high structural similarity between repos. At a high level:

1. **Set up the monorepo workspace** using npm workspaces. Establish the shared package structure.
2. **Move election-api first** (smallest repo, 51 PRs in 6 months, lowest risk). Validate the workflow.
3. **Move people-api second.** At this point, shared infra packages prove their value.
4. **Move gp-api last** (largest repo, most active). By now the patterns are established.

Each step is independently valuable — even if we only move 2 of 3 repos, we've reduced duplication.

## Open Questions

- **Git history preservation?** We can merge repos preserving full git history with `git subtree` or similar. Worth confirming the approach.
- **CODEOWNERS / review boundaries?** If teams want to maintain ownership boundaries within the monorepo, GitHub CODEOWNERS supports path-based rules.
