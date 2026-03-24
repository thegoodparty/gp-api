# Alerting

## Overview

gp-api has an automated alerting system that provisions [Grafana alert rules](https://goodparty.grafana.net) via Pulumi. Alerts are **only active in production** and live in a Grafana folder called `Alerts (provisioned via gp-api)`.

There are two categories of alerts:

### Controller Alerts (auto-generated)

Every controller endpoint automatically gets two alerts:

- **Error count**: Fires when any requests return error status codes (≥ 400, excluding 401/403/404/409/498) within a 1-hour window.
- **P95 latency**: Fires when the 95th percentile response time exceeds 2000ms for GET requests or 3000ms for writes (POST/PUT/DELETE/PATCH) over a 1-hour window.

These are generated automatically from the controllers in the codebase -- you don't write them by hand. **All controller alerts are disabled by default** and require explicit opt-in via the ownership mapping (see [Ownership](#ownership) below).

### Global Alerts (hand-written)

These cover system-wide concerns that aren't tied to a specific endpoint:

- **High CPU utilization** (>80% for 5 min)
- **High memory utilization** (>90% for 5 min)
- **Missing health check logs** (no `/v1/health` requests logged for 2 min)
- **Slow Prisma connection acquisitions** (10+ connections exceeding 150ms in a 2-minute window)

## Where do alerts show up?

When an alert fires, Grafana sends a notification to the `#dev-alerts` Slack channel. The notification includes:

- The alert name and a description with guidance on how to investigate
- A link back to the alert in Grafana
- A mention of the owning Slack group (`@serve-bugs` or `@win-bugs`) if applicable

You can also view all alert states in the [Grafana Alerting UI](https://goodparty.grafana.net/alerting/list).

## Ownership

_Controller_ alerts follow a **Serve/Win ownership model**. Each controller is assigned to either the `serve-bugs` or `win-bugs` Slack group, which determines who gets notified when an alert fires.

Ownership is configured in `deploy/components/alerts.ts` via `ALERT_OWNERSHIP`:

```typescript
export const ALERT_OWNERSHIP: Record<SlackGroup, ControllerName[]> = {
  'serve-bugs': [
    'elected-office',
    'polls',
    'contacts',
    'contact-engagement',
    'organizations',
  ],
  'win-bugs': [],
}
```

Controllers that aren't assigned to either group still get alerts generated, but they're **disabled** (paused in Grafana) until someone claims ownership.

## Key files

All alerting configuration lives in `deploy/`:

| File                                              | Purpose                                                                          |
| ------------------------------------------------- | -------------------------------------------------------------------------------- |
| `deploy/components/alerts.ts`                     | Ownership mapping, default thresholds, per-endpoint overrides, and global alerts |
| `deploy/components/alerting/controller-alerts.ts` | Generates error count + latency alerts for each controller endpoint              |
| `deploy/components/alerting/alerts.types.ts`      | Type definitions for `Alert`, `EndpointOverride`, `SlackGroup`                   |
| `deploy/components/grafana.ts`                    | Converts alerts into Grafana rule groups via Pulumi                              |

## How to opt in a controller

Opting in a controller means assigning it an owner. Add the controller to the appropriate team in `ALERT_OWNERSHIP` in `deploy/components/alerts.ts`. The controller name is the string from the `@Controller('...')` decorator (e.g., `@Controller('contacts')` -> `'contacts'`), and will be typesafe and autocompleted by your editor.

All of that controller's endpoint alerts become active on the next deploy.

## How to override thresholds

Error alerts always fire on any unexpected error and cannot be overridden -- if an endpoint is returning errors, you should know about it.

Latency thresholds can be overridden per-endpoint by adding an entry to `ENDPOINT_OVERRIDES` in `deploy/components/alerts.ts`:

```typescript
export const ENDPOINT_OVERRIDES: Partial<Record<Endpoint, EndpointOverride>> = {
  'GET /v1/contacts': {
    p95LatencyMs: 5000,
  },
}
```

Endpoint strings are in the format `METHOD /v1/controller/path` and are type-safe -- your editor will autocomplete them.

## How to add a new global alert

Add an entry to `GLOBAL_ALERTS` in `deploy/components/alerts.ts`:

```typescript
{
  slug: 'my-new-alert',                    // unique identifier
  name: 'Something bad happened',          // shown in Grafana and Slack
  type: 'log',                             // 'log' | 'metric' (Loki / Prometheus)
  expr: 'count_over_time({service_name="gp-api", deployment_environment_name="$ENV"} |= "something bad" [5m])',
  threshold: 1,                            // fires when expr result exceeds this value
  for: '5m',                               // must exceed threshold for this long before firing
  message: 'Description of what happened and how to investigate.',
  notify: 'serve-bugs',                    // optional: which Slack group to ping
}
```

See the inline documentation on alert entries for more details and references to documentation.

Key things to know:

- Use `$ENV` in your expression -- it gets replaced with the environment name (`prod`) at deploy time.
- `type: 'log'` queries go to Loki (structured logs). `type: 'metric'` queries go to Prometheus.
- `notify` is optional. If omitted, the alert still fires but won't mention a Slack group.

- The `for` field is a grace period -- the threshold must be continuously exceeded for that duration before the alert actually fires.
- `threshold` is compared with `>`, so `threshold: 0` means "fire if the value is greater than 0".

For more details on configuring alerts, see the [Grafana Alerting documentation](https://grafana.com/docs/grafana/latest/alerting/fundamentals/alert-rule-evaluation/).
