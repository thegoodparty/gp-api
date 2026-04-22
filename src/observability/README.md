# `src/observability/`

Cross-cutting observability concerns. Most of the OTel wiring lives in `src/otel.ts` (top-level) — this directory holds the application-level integrations.

- `logging/` — Pino setup, custom serializers, and the `LoggerExceptionFilter`
- `grafana/` — Grafana-specific helpers (deeplinks, dashboard config refs)
- `blockedState/` — `BlockedStateInterceptor` that records user-blocking failures to New Relic and OTel

For alert configuration (provisioned via Pulumi) see `docs/observability.md` and `deploy/components/alerts.ts`.
