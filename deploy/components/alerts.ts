import { glob } from 'fast-glob'
import { readFileSync } from 'node:fs'

export type SlackGroup = 'serve-bugs' | 'win-bugs'

export type Alert = {
  /** A unique slug for the alert. Used internally for resource naming. */
  slug: string
  /** The human-readable name shown in Grafana and Slack notifications. */
  name: string
  /**
   * The type of datasource the query targets.
   *
   * - `log`: A LogQL metric query against Loki.
   * - `metric`: A PromQL query against Prometheus.
   *
   * Both use `$ENV` as a placeholder for the environment name (e.g. "prod").
   */
  type: 'log' | 'metric'
  /**
   * The query expression. Use `$ENV` for the environment name.
   *
   * Log (LogQL) examples:
   *   'count_over_time({service_name="gp-api", deployment_environment_name="$ENV"} |= "Request completed" | json | response_statusCode >= 500 [5m])'
   *   'absent_over_time({service_name="gp-api", deployment_environment_name="$ENV"} [5m])'
   *
   * Metric (PromQL) examples:
   *   'avg(process_cpu_utilization{service_name="gp-api", deployment_environment_name="$ENV"}) * 100'
   *
   * See: https://grafana.com/docs/loki/latest/query/metric_queries/
   * See: https://prometheus.io/docs/prometheus/latest/querying/basics/
   */
  expr: string
  /**
   * How LONG the query results must continuously exceed the threshold before the alert
   * fires. This acts as a grace period to avoid alerting on brief spikes.
   * Format: "<number>m" (e.g. "5m" = 5 minutes).
   */
  for: `${number}m`
  /**
   * The value that `expr` must exceed before the alert starts pending.
   * The unit depends on what your expr returns (e.g. percentage, milliseconds, count).
   */
  threshold: number
  /** A message to include in the Slack notification. */
  message: string

  /** The Slack group to notify when the alert is triggered. */
  notify?: SlackGroup

  /** Whether the alert is disabled. */
  disabled?: boolean
}

const ALL_CONTROLLERS = glob
  .sync(`${__dirname}/../../src/**/*.controller.ts`)
  .map((path) => readFileSync(path, 'utf8'))
  .map((file) => file.match(/@Controller\('([^']+)'\)/)?.[1])
  .filter((controller) => controller !== undefined)

/** Map of slack group to controllers */
const ALERTING_CONFIG: Record<SlackGroup, string[]> = {
  'serve-bugs': ['elected-office', 'polls', 'contacts', 'contact-engagement'],
  'win-bugs': [],
}

/**
 * Builds a filter for a controller that excludes child controllers.
 *
 * example: we don't want the "campaigns" controller to alert on the "campaigns/ai"
 * controller's 5xx rate.
 */
const buildControllerFilter = (controller: string): string => {
  const children = ALL_CONTROLLERS.filter(
    (c) => c !== controller && c.startsWith(`${controller}/`),
  )

  const filters = [`| request_endpoint =~ \`.* /v1/${controller}($|/.*)\``]

  for (const child of children) {
    filters.push(`| request_endpoint !~ \`.* /v1/${child}($|/.*)\``)
  }

  return filters.join(' ')
}

const perControllerAlerts = (controller: string): Alert[] => {
  const slug = controller.replace(/[/:]/g, '-')
  const slackGroupName = Object.entries(ALERTING_CONFIG).find(
    ([_, controllers]) => controllers.includes(controller),
  )?.[0]

  const filter = buildControllerFilter(controller)
  const base = `{service_name="gp-api", deployment_environment_name="$ENV"} |= "Request completed" | json ${filter}`

  return [
    {
      slug: `${slug}-http-5xx`,
      name: `[${controller}] High 5xx rate`,
      type: 'log',
      expr: `sum(count_over_time(${base} | response_statusCode >= 500 [5m])) / sum(count_over_time(${base} [5m])) * 100`,
      threshold: 5,
      for: '3m',
      message: `The \`${controller}\` controller is returning more than 5% 5xx responses.`,
      notify: slackGroupName as SlackGroup,
      disabled: !slackGroupName,
    },
    {
      slug: `${slug}-http-p95-latency`,
      name: `[${controller}] High p95 latency`,
      type: 'log',
      expr: `quantile_over_time(0.95, ${base} | keep responseTimeMs | unwrap responseTimeMs [5m])`,
      threshold: 2000,
      for: '3m',
      message: `The \`${controller}\` controller's p95 latency has exceeded 2 seconds for 3 minutes.`,
      notify: slackGroupName as SlackGroup,
      disabled: !slackGroupName,
    },
  ]
}

/**
 * Add to this array to create new alerts.
 */
export const ALERTS: Alert[] = [
  {
    slug: 'high-cpu',
    name: 'High CPU utilization',
    type: 'metric',
    expr: 'avg(process_cpu_utilization{service_name="gp-api", deployment_environment_name="$ENV"}) * 100',
    threshold: 80,
    for: '5m',
    message: 'Process CPU utilization has exceeded 80% for 5 minutes.',
  },
  {
    slug: 'high-memory',
    name: 'High memory utilization',
    type: 'metric',
    expr: 'avg(system_memory_utilization{service_name="gp-api", deployment_environment_name="$ENV", system_memory_state="used"}) * 100',
    threshold: 90,
    for: '5m',
    message: 'System memory utilization has exceeded 90% for 5 minutes.',
  },
  {
    slug: 'missing-health-check',
    name: 'Missing health check logs',
    type: 'log',
    expr: 'absent_over_time({service_name="gp-api", deployment_environment_name="$ENV"} |= "Request completed" |= "/v1/health" [2m])',
    threshold: 0,
    for: '2m',
    message:
      'No health check requests logged in the last 2 minutes — the service may be down.',
  },
  ...ALL_CONTROLLERS.flatMap(perControllerAlerts),

  // ------ Serve Alerts ------ //
  {
    slug: 'serve-background-job-failed',
    name: '[Serve] Background job failed',
    type: 'log',
    expr: 'sum(count_over_time({service_name="gp-api", deployment_environment_name="$ENV"} |= "Message processing failed" |= "poll" [5m]))',
    threshold: 1,
    for: '5m',
    message:
      'A Serve-related background SQS job has failed in the last 5 minutes.',
  },
]
