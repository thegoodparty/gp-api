# RFC: Reducing Backend Operational Tax

## Status: Draft

## Problem Statement

Our backend is split across multiple repositories (gp-api, people-api, election-api, with more on the way). This structure is costing us measurable engineering time through duplicated work, version drift, and coordination overhead — without providing meaningful architectural benefits in return.

This doc proposes three options, evaluates each against concrete data, and recommends one.

## The Cost We're Paying Today

At a high level, the multi-repo structure is costing us in three ways:

- **Code duplication and drift** — thousands of lines of nearly identical boilerplate (OTel, Dockerfiles, CI/CD, Pulumi, shared config like tsconfig and lint rules) are maintained independently per repo. When these diverge — and they already have — bugs, inconsistencies, and wasted effort follow.
- **Growing maintenance burden** — every infrastructure improvement, bug fix, or dependency update must be applied N times. Dependabot alone will generate hundreds of redundant PRs per year. Each new service multiplies the problem linearly.
- **Higher defect risk** — bugs in shared infrastructure propagate manually and unevenly. Version drift across repos means a fix that works in one repo may not work in another.

Each of these costs works directly against goals we've already aligned on in the VOTES framework:

- **Velocity** — duplicated PRs and propagation delays inflate cycle time with zero product value
- **Operations** — multi-repo coordination is a structural pain point in automating releases
- **Testing** — each repo independently maintains its own test framework, coverage gates, and CI pipelines
- **Experience** — bugs in shared boilerplate that introduce debugging pain must be fixed in each repo independently, slowing resolution of blocked states
- **Security** — every additional repo multiplies our dependency security surface; version drift means a vulnerability patched in one repo may remain unpatched in another

The sections below quantify each of these costs with specific data.

### Developer time: ~30 duplicative PRs in 6 months

Between September 2025 and March 2026, at least 30 merged PRs across our repos were duplicative cross-repo infrastructure work:

| Work Item                      | gp-api PRs | people-api PRs | election-api PRs | Total  |
| ------------------------------ | ---------- | -------------- | ---------------- | ------ |
| Pulumi migration               | ~15        | 4              | 2                | **21** |
| Grafana/Pino adoption          | 2          | 1              | 1                | **4**  |
| Dependabot config              | 1          | 1              | 1                | **3**  |
| Deployment circuit breaker fix | 1          | 1              | 1                | **3**  |
| Vitest setup                   | 1          | 1              | 1                | **3**  |
| Prod deploy coordination       | 4          | 3              | 1                | **8**  |
| **Pending: Alerting**          | **3**      | **0**          | **0**            | **—**  |

The Pulumi migration illustrates the structural problem clearly: because our infrastructure code is ~70% identical across repos but lives in three separate places, migrating from SST to Pulumi required ~21 PRs across three repos. In the best case, each repo would have been migrated on the same day — but in practice, gp-api was migrated Jan 15–29, election-api on Feb 4, and people-api not until Mar 2, creating a 6-week window where our repos were running different IaC systems. In a shared codebase, the core migration would have been done once with per-service configuration layered on top.

The Dependabot configuration is the simplest example: 3 identical PRs, same author, same day (Feb 10), with the PR description copy-pasted verbatim across all three repos.

Grafana and Pino logging were adopted across all three repos on the same day (Feb 27) via separate PRs — the best case. Alerting is the other end of the spectrum: 3 PRs have landed in gp-api, but the work has not yet propagated to people-api or election-api.

### Reliability: version drift and uneven bug propagation

Despite these repos being created within months of each other, dependency versions have already diverged:

| Dependency    | gp-api  | people-api | election-api |
| ------------- | ------- | ---------- | ------------ |
| TypeScript    | 5.6.3   | 5.9.3      | 5.8.2        |
| Prisma        | 6.3.0   | 6.5.0      | 6.4.1        |
| Pulumi AWS    | ~6.67.0 | ^7.17.0    | ^7.17.0      |
| Pino (nestjs) | 4.6.0   | 4.4.1      | 4.6.0        |

The Pulumi AWS version split (6.x vs 7.x) is especially notable — our primary infrastructure tool is on different major versions across repos, meaning infrastructure code that works in one repo may not work in another.

Bug fixes are also affected. The deployment circuit breaker fix is the clearest example: a production-impacting deployment bug required 3 separate PRs on the same day. The people-api and election-api PRs literally just say "See gp-api #1230." A bug that should have been a one-line fix in one place required three PRs, three reviews, and three deployments — with three chances to miss one.

A security patch or breaking change in any shared dependency must now be evaluated and applied independently in each repo. The longer we wait, the more divergent the repos become and the harder it is to bring them back in line.

### Velocity: thousands of duplicated lines slow every change

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

Each of these represents a surface area where a bug fix, improvement, or config change must be applied N times. With Dependabot now active in all three repos, every dependency update generates 3 separate PRs to review and merge. Over the course of a year, this will add up to hundreds of redundant Dependabot PRs.

### Focus: each new service multiplies the problem

Releases that span services must be coordinated manually. On Feb 2 and Feb 12, we had "prod deploy" PRs merged on the same day across multiple repos — suggesting releases that required touching multiple repos in sequence. Each new service multiplies this coordination cost linearly.

We currently lack the ops tooling (release trains, cross-repo CI, service mesh, contract testing) that organizations typically use to manage multi-service deployments safely. This isn't a criticism — building that tooling is a significant investment that we should only make if the multi-service architecture is providing commensurate value.

## Options

### Option A: Shared npm packages + reusable GitHub Actions

Invest in extracting duplicated backend code into npm packages that all repos consume. Pair this with [reusable GitHub Actions workflows](https://docs.github.com/en/actions/sharing-automations/reusing-workflows) to reduce CI/CD duplication across repos.

**What it solves:**

- Shared code between backend repos — infra code (OTel, exception filters), Prisma base classes, NestJS boilerplate, types/schemas, shared tsconfig and lint rules
- CI/CD duplication — reusable workflows allow repos to call shared workflow definitions from a central repo, reducing copy-paste across CI pipelines
- Could extend to shared Pulumi components and Docker base images

**What it doesn't solve:**

- IaC duplication — Pulumi components would still need their own package, versioning, and release cycle. Reusable workflows help with the CI pipeline that _runs_ Pulumi, but not with the Pulumi code itself.
- Coordination overhead — releases still happen independently per repo, and cross-service changes still require sequential PRs
- Dependabot multiplier — still N repos x M dependency updates
- Version drift — each repo still controls its own dependency versions independently

**What it costs:**

Scaling npm-based code sharing to cover all our duplicated infrastructure would require creating and maintaining several internal packages (OTel config, Pulumi components, exception filters, Prisma base classes, Docker templates). Each package introduces ongoing costs:

- **Version propagation overhead.** Every change to a shared package requires a publish cycle, then a version bump in every consuming repo, then verification that nothing broke. For tightly-coupled infrastructure code (e.g., a Pulumi component used by all services), this creates a slow feedback loop: change the package, publish, update 3+ consumers, and hope the integration works. The alternative — pinning shared packages to `latest` — sacrifices reproducibility.
- **Transitive dependency management.** Shared packages that depend on NestJS, Prisma, or Pulumi must keep their peer dependency ranges aligned with every consumer. When gp-api upgrades NestJS, the shared packages must be updated and republished before the upgrade can land. This creates coupling without co-location — the worst of both worlds.
- **Packaging infrastructure.** Each shared package needs its own build system, release automation, and CI pipeline. Setting up npm publishing with OIDC, changeset automation, and CJS/ESM compatibility is non-trivial work that serves the packaging system rather than the product.
- **Where do you pin shared dependencies?** If NestJS, Prisma, and TypeScript versions should be consistent across services (and they should — see the version drift table above), someone has to decide where the canonical version lives. With npm packages, this is an unsolved governance problem. Each repo can still drift independently.
- **Reusable workflow constraints.** Reusable GitHub Actions workflows have [real limitations](https://docs.github.com/en/actions/sharing-automations/reusing-workflows#limitations): they can't call other reusable workflows (max 1 level of nesting), the calling workflow can only use up to 20 reusable workflows total, and `env` context variables from the caller are not available inside the reusable workflow. Secrets must be passed explicitly or via `secrets: inherit`. For our use case, this means the shared workflows would need to be fairly coarse-grained, and per-service customizations (different deploy targets, different environment variables) would still require boilerplate in each repo's calling workflow.
- **New shared repo to maintain.** The reusable workflows need to live somewhere — typically a dedicated `.github` or `shared-workflows` repo. This is another repo to manage, version, and keep in sync. Changes to shared workflows affect all consumers immediately (unless pinned to a SHA/tag), which can break CI across repos simultaneously.

**Assessment:** This option addresses code sharing well and makes a meaningful dent in CI/CD duplication. It's a real improvement over the status quo. However, it introduces significant new infrastructure (package publishing, workflow repo, version governance) and leaves several core problems unsolved: Dependabot multiplier, version drift, release coordination, and IaC duplication. It trades one kind of operational overhead for another — arguably more manageable, but still scaling linearly with repo count.

The existing `@goodparty_org/contracts` package and `gp-sdk` are great examples of npm publishing done right — they serve external consumers who need a stable, versioned API. This proposal does not replace that work; it addresses a different problem (internal infrastructure duplication) where the publish-consume cycle adds friction without proportional benefit.

### Option B: Monorepo

Consolidate all backend repos into a single repository using npm workspaces.

**To be clear: this does not mean merging services into a single application.** Each service (gp-api, people-api, election-api) remains its own NestJS application, its own Prisma schema, its own Docker image, and its own ECS deployment. The services continue to be deployed separately. What changes is that they share a single repository, a single CI/CD pipeline, and a single set of infrastructure code. This is a code organization change, not an architecture change.

**What it solves:**

- **All duplicated infrastructure becomes shared.** OTel config, Dockerfiles, CI/CD, Pulumi components, exception filters, Prisma configuration, shared tsconfig, and lint rules — all exist once and are consumed by each service as workspace dependencies.
- **Version drift becomes impossible.** A single root package.json controls shared dependency versions. Dependabot generates one PR, not three.
- **Bug fixes land once.** The circuit breaker fix would have been one PR touching one file, reviewed once, deployed everywhere.
- **CI/CD is unified.** One workflow builds and deploys all affected services. No cross-repo coordination for releases.
- **Atomic changes across services.** A schema change that affects both gp-api and election-api can land in a single PR with a single review, rather than requiring coordinated changes across repos.

**What it costs:**

- **Migration effort.** Moving repos into a monorepo requires git history preservation, CI/CD rework, and team coordination. This is non-trivial — consolidating three repos with their own CI pipelines, Pulumi stacks, and deployment workflows will require careful planning and execution. Going forward, maintenance of the shared structure should be straightforward, but the initial migration is real work that we should not underestimate.
- **Repo size.** gp-api is ~48K lines of application code. people-api and election-api add ~6K lines combined. After eliminating duplicated boilerplate (~2,500 lines of deploy code, ~900 lines of CI/CD, and ~1,200 lines of shared infra like OTel/filters), the net new code introduced by consolidation is approximately **4,000 lines of unique application logic** from people-api and election-api. GitHub CODEOWNERS can maintain ownership boundaries by path.
- **Dependency reconciliation.** Merging three repos means reconciling their dependency versions into a single lockfile. The version drift table above shows this is already non-trivial (e.g., Pulumi AWS 6.x vs 7.x). A workspace-aware package manager like pnpm or Yarn 4 can help manage per-service dependency overrides during the transition, but the reconciliation work itself must happen.
- **CI run time.** Individual CI runs may take longer, since a single pipeline now builds and tests multiple services. If this becomes a problem, change detection tooling can be added to only run CI for affected services.

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

**Assessment:** This directly eliminates the duplication tax, prevents version drift, and reduces coordination overhead. It does not require changing our service architecture. The migration is real work — non-trivial and requiring careful execution — but it is bounded, one-time work. The ongoing tax of the current setup compounds with each new service; the monorepo migration cost does not.

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

| Problem                               | npm + shared workflows                | Monorepo                           | Status quo        |
| ------------------------------------- | ------------------------------------- | ---------------------------------- | ----------------- |
| Duplicated IaC (21 Pulumi PRs)        | Partially solves (shared components)  | Solves                             | Continues         |
| Duplicated CI/CD                      | Partially solves (reusable workflows) | Solves                             | Continues         |
| Version drift (3 TS versions)         | Does not solve                        | Solves                             | Worsens           |
| Dependabot multiplier                 | Does not solve                        | Solves                             | Worsens (4x soon) |
| Bug fix propagation (circuit breaker) | Partially solves                      | Solves                             | Continues         |
| Cross-service release coordination    | Does not solve                        | Solves                             | Continues         |
| Type sharing with frontend            | Solves                                | Solves (contracts still publishes) | Does not solve    |
| Package versioning overhead           | Introduces it                         | Eliminates for internal code       | N/A               |

npm packages solve the type-sharing problem well and should continue to exist for that purpose. But they don't address the majority of our operational overhead, which is in infrastructure, CI/CD, and deployment duplication. A monorepo solves all of these while also being the natural home for the contracts package.

Beyond the direct problem-solving, a monorepo aligns with our team's capabilities. We are a small team without deep infrastructure or ops specialization — and that's fine. But multi-repo microservices require exactly that specialization: cross-repo CI orchestration, shared library versioning strategies, coordinated release management. Every hour we spend building and maintaining that tooling is an hour not spent on the product. A monorepo dramatically reduces the surface area of ops knowledge our team needs to maintain, letting us focus engineering effort where it has the most product impact.

## Migration Approach (High-Level)

If this is accepted, a detailed migration plan would follow. The migration is non-trivial — consolidating CI/CD, reconciling dependencies, and setting up deploys all require careful work. Once the structure is in place, ongoing maintenance should be straightforward. At a high level:

1. **Set up the monorepo workspace** using npm workspaces. Establish the shared package structure.
2. **Move election-api first** (smallest repo, 51 PRs in 6 months, lowest risk). Validate the workflow.
3. **Move people-api second.** At this point, shared infra packages prove their value.
4. **Move gp-api last** (largest repo, most active). By now the patterns are established.

Each step is independently valuable — even if we only move 2 of 3 repos, we've reduced duplication.

## Open Questions

- **Git history preservation?** We can merge repos preserving full git history with `git subtree` or similar. Worth confirming the approach.
- **CODEOWNERS / review boundaries?** If teams want to maintain ownership boundaries within the monorepo, GitHub CODEOWNERS supports path-based rules.
