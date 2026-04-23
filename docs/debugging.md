# Debugging gp-api

Recipes for going from a reported bug to a reproduction.

## Logs (Loki)

All logs ship to Grafana Cloud Loki. Service label is `gp-api`. Environment label is `dev`, `qa`, or `prod`.

Base query:

```logql
{service_name="gp-api", deployment_environment_name="prod"}
```

Filter by an error string:

```logql
{service_name="gp-api", deployment_environment_name="prod"} |= "PrismaClientKnownRequestError"
```

Filter by a controller class (Pino sets `context` to the class name):

```logql
{service_name="gp-api", deployment_environment_name="prod"} | json | context="CampaignsController"
```

Filter by request id (set by `pino-http`, propagated via `req.id`):

```logql
{service_name="gp-api", deployment_environment_name="prod"} | json | reqId="abc123"
```

## Traces (Tempo)

Service name in TraceQL is `gp-api`. Find slow Prisma calls:

```traceql
{ service.name="gp-api" && name=~"prisma.*" && duration > 200ms }
```

Find traces by HTTP route:

```traceql
{ service.name="gp-api" && http.route="/v1/campaigns" }
```

## Metrics (Prometheus)

Standard exporters: HTTP, Prisma, Node runtime, Fastify. Browse via the Grafana Explore view with the `grafanacloud-prom` datasource. Service-specific dashboards live in the `gp-api` Grafana folder.

## Reproducing locally with `useTestService()`

`src/test-service.ts` spins up a real Postgres via testcontainers and bootstraps the full NestJS app. Use it to write a failing test that mirrors the production path.

```ts
import { useTestService } from '@/test-service'

describe('repro for ENG-1234', () => {
  const service = useTestService()

  it('reproduces the bug', async () => {
    await service.prisma.campaign.create({
      data: { userId: service.user.id, slug: 'broken' },
    })
    const res = await service.client.get('/v1/campaigns/broken')
    expect(res.status).toBe(200)
  })
})
```

Run a single file:

```bash
npx vitest run src/path/to/repro.test.ts
```

## Alerting

See `docs/observability.md` for which alerts exist, how they're owned, and how to add new ones.
