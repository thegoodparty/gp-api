# Deploy

Pulumi (TypeScript) infrastructure-as-code, the production Dockerfile, and the `infra-cli.ts` wrapper used by the `npm run infra` commands. Targets four environments: `preview` (per-PR), `dev` (`develop` branch), `qa`, `prod`.

## Key files

| Path                                 | Purpose                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------- | --------------------------------- |
| `index.ts`                           | Pulumi program entry — wires VPC, service, asset bucket, Grafana resources |
| `Pulumi.yaml`                        | Stack metadata (`name: gp-api`, `runtime: nodejs`)                         |
| `infra-cli.ts`                       | yargs-based CLI wrapping `pulumi`; `npm run infra <diff                    | deploy> <env>` shells out to this |
| `Dockerfile`                         | Production image build (Node 22 Alpine, multi-copy with prebuilt `dist/`)  |
| `docker-entrypoint.sh`               | Container bootstrap (env validation, migration check, app start)           |
| `components/service.ts`              | ECS Fargate service + ALB target group                                     |
| `components/vpc.ts`                  | VPC selection (existing VPC, hardcoded subnets/SGs)                        |
| `components/assets-bucket.ts`        | S3 bucket for user uploads                                                 |
| `components/assets-router.ts`        | CloudFront fronting the assets bucket                                      |
| `components/grafana.ts`              | Grafana data sources, dashboards, contact points                           |
| `components/alerting/` + `alerts.ts` | Grafana alert rules and routing                                            |
| `pulumi/`                            | `node_modules` for Pulumi's runtime (separate dependency tree)             |

## Patterns

- **Environment is a literal union** (`'preview' \| 'dev' \| 'qa' \| 'prod'`) narrowed from `pulumi.Config().require('environment')`. The `select<T>(values)` helper in `index.ts` is the canonical way to choose per-env values — use it instead of `if/else` chains.
- **Preview stacks are ephemeral**: `prNumber` is required for `preview`, and stack name is `pr-${prNumber}`. `find-stale-preview-stacks.ts` cleans up dangling ones.
- **Pulumi config secrets** come from SSM via `infra-cli.ts` (`PULUMI_CONFIG_PASSPHRASE`, `GRAFANA_AUTH`, `GRAFANA_SM_ACCESS_TOKEN`). The CLI fetches them per-run; nothing is committed.
- **Docker image is tagged with `imageUri`** passed in from CI; `index.ts` reads it via `pulumi.Config()`. Local builds aren't deployable — push through the workflow.
- **Observability lives here, not just in app code.** Grafana dashboards/alerts are defined in `components/grafana.ts` and `components/alerting/`. App-side metric naming must line up with these.

## Gotchas

- VPC ID, subnet IDs, security group IDs, and the hosted zone are **hardcoded** in `index.ts`. They reference the existing AWS account and aren't created by Pulumi. Don't try to make them dynamic.
- `pulumi/` has its own `node_modules` — don't `npm install` inside `deploy/`. Pulumi resolves from there at runtime.
- `Dockerfile` copies `node_modules/.prisma` from the build host. CI must run `prisma generate` before the docker build, or the image will fail at runtime with missing native engines.
- `infra deploy preview` requires `prNumber`; running it without one will throw on `config.require`.
