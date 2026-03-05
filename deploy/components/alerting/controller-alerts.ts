import { ControllerName, ROUTE_MAP } from '../../../src/generated/route-types'
import { Alert, SlackGroup } from './alerts.types'
import {
  ALERT_OWNERSHIP,
  DEFAULT_ERROR_ALERT_THRESHOLD_PERCENTAGE,
  DEFAULT_P95_READ_LATENCY_MS,
  DEFAULT_P95_WRITE_LATENCY_MS,
  ENDPOINT_OVERRIDES,
} from '../alerts'

export const controllerAlerts = (controller: ControllerName): Alert[] => {
  const slackGroupName = Object.entries(ALERT_OWNERSHIP).find(
    ([_, controllers]) => controllers.includes(controller),
  )?.[0]
  const routes = ROUTE_MAP[controller]

  return routes.flatMap((route) => {
    const overrides =
      ENDPOINT_OVERRIDES[route.endpoint as keyof typeof ENDPOINT_OVERRIDES]
    const errorRatePercentage =
      overrides?.errorRatePercentage ?? DEFAULT_ERROR_ALERT_THRESHOLD_PERCENTAGE
    const p95LatencyMs =
      overrides?.p95LatencyMs ??
      (route.method === 'GET'
        ? DEFAULT_P95_READ_LATENCY_MS
        : DEFAULT_P95_WRITE_LATENCY_MS)

    const routeBase = `{service_name="gp-api", deployment_environment_name="$ENV"} |= "Request completed" | json | request_endpoint = "${route.endpoint}"`
    const slug = route.endpoint.replace(/[/:]/g, '-').replace(' ', '-')

    return [
      {
        slug: `${slug}-error-rate`,
        name: `[${controller}] ${route.endpoint} - High error rate`,
        type: 'log' as const,
        expr: `sum(count_over_time(${routeBase} | response_statusCode >= 500 [5m])) / sum(count_over_time(${routeBase} [5m])) * 100`,
        threshold: errorRatePercentage,
        for: '3m',
        message: `\`${route.endpoint}\` is returning more than ${errorRatePercentage}% 5xx responses.`,
        notify: slackGroupName as SlackGroup,
        disabled: !slackGroupName,
      } satisfies Alert,
      {
        slug: `${slug}-p95-latency`,
        name: `[${controller}] ${route.endpoint} - High p95 latency`,
        type: 'log' as const,
        expr: `quantile_over_time(0.95, ${routeBase} | keep responseTimeMs | unwrap responseTimeMs [5m])`,
        threshold: p95LatencyMs,
        for: '3m',
        message: `\`${route.endpoint}\` p95 latency has exceeded ${p95LatencyMs}ms for 3 minutes.`,
        notify: slackGroupName as SlackGroup,
        disabled: !slackGroupName,
      } satisfies Alert,
    ]
  })
}
