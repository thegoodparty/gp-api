import { ControllerName, ROUTE_MAP } from '../../../src/generated/route-types'
import { Alert, SlackGroup } from './alerts.types'
import {
  ALERT_OWNERSHIP,
  DEFAULT_P95_READ_LATENCY_MS,
  DEFAULT_P95_WRITE_LATENCY_MS,
  ENDPOINT_OVERRIDES,
} from '../alerts'

const EXCLUDED_STATUS_CODES = [401, 403, 404, 409, 498]
const statusCodeFilter = [
  'response_statusCode >= 400',
  ...EXCLUDED_STATUS_CODES.map((code) => `response_statusCode != ${code}`),
].join(' and ')

export const controllerAlerts = (controller: ControllerName): Alert[] => {
  const slackGroupName = Object.entries(ALERT_OWNERSHIP).find(
    ([_, controllers]) => controllers.includes(controller),
  )?.[0]
  const routes = ROUTE_MAP[controller]

  return routes.flatMap((route) => {
    const overrides =
      ENDPOINT_OVERRIDES[route.endpoint as keyof typeof ENDPOINT_OVERRIDES]
    const p95LatencyMs =
      overrides?.p95LatencyMs ??
      (route.method === 'GET'
        ? DEFAULT_P95_READ_LATENCY_MS
        : DEFAULT_P95_WRITE_LATENCY_MS)

    const routeBase = `{service_name="gp-api", deployment_environment_name="$ENV"} |= "Request completed" | json | request_endpoint = "${route.endpoint}"`
    const slug = route.endpoint.replace(/[/:]/g, '-').replace(' ', '-')

    return [
      {
        slug: `${slug}-error-count`,
        name: `[${controller}] ${route.endpoint} - Errors detected`,
        type: 'log' as const,
        expr: `sum(count_over_time(${routeBase} | ${statusCodeFilter} [1h]))`,
        threshold: 0,
        for: '1m',
        message: [
          `\`${route.endpoint}\` returned unexpected error responses in the last hour (status ≥ 400, excluding 401/403/404/409/498).`,
          'Click *View in Grafana* to find the failing requests, then examine their logs and stack traces to understand why errors are occurring and ship fixes.',
        ].join('\n\n'),
        notify: slackGroupName as SlackGroup,
        disabled: !slackGroupName,
      } satisfies Alert,
      {
        slug: `${slug}-p95-latency`,
        name: `[${controller}] ${route.endpoint} - High p95 latency`,
        type: 'log' as const,
        expr: `quantile_over_time(0.95, ${routeBase} | keep responseTimeMs | unwrap responseTimeMs [1h])`,
        threshold: p95LatencyMs,
        for: '1m',
        message: [
          `\`${route.endpoint}\` p95 latency has exceeded ${p95LatencyMs}ms over the last hour.`,
          'Click *View in Grafana* to find the slow requests, then examine their traces to identify the bottleneck (slow DB queries, external API calls, etc.). If this endpoint is expected to be this slow, <https://github.com/thegoodparty/gp-api/blob/develop/ALERTING.md#how-to-override-thresholds|raise the threshold>.',
        ].join('\n\n'),
        notify: slackGroupName as SlackGroup,
        disabled: !slackGroupName,
      } satisfies Alert,
    ]
  })
}
