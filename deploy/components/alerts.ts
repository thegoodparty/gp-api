export type Alert = {
  /** A unique id/slug for the alert. Used internally for resource naming. */
  id: string
  /** The human-readable name shown in Grafana and Slack notifications. */
  name: string
  /**
   * A LogQL metric query that returns a single numeric value.
   * Use `$SELECTOR` as the log stream selector — it will be replaced with
   * the environment-specific selector on deploy:
   *   {service_name="gp-api", deployment_environment_name="<env>"}
   *
   * Every 60 seconds, Grafana evaluates `expr`. If the result exceeds
   * `threshold`, the alert goes pending, then fires after `for`.
   *
   * Examples:
   *   // 5xx error rate as a percentage
   *   'count_over_time($SELECTOR |= "Request completed" | json | response_statusCode >= 500 [5m]) / count_over_time($SELECTOR |= "Request completed" [5m]) * 100'
   *
   *   // p99 latency from request logs
   *   'quantile_over_time(0.99, $SELECTOR |= "Request completed" | json | unwrap responseTimeMs [5m])'
   *
   *   // Count error logs
   *   'count_over_time($SELECTOR |= "level=50" [10m])'
   *
   *   // Absence detection (service down)
   *   'absent_over_time($SELECTOR [5m])'
   *
   * See: https://grafana.com/docs/loki/latest/query/metric_queries/
   */
  expr: string
  /**
   * How LONG the query results must continuously exceed the threshold before the alert
   * fires. This acts as a grace period to avoid alerting on brief spikes.
   * Format: "<number>m" (e.g. "5m" = 5 minutes).
   */
  for: `${number}m`
  /**
   * The Slack channel to notify when the alert fires (e.g. "#eng-alerts").
   * Note: must be a PUBLIC slack channel.
   */
  slackChannel: `#${string}`
  /** An optional custom message to include in the Slack notification. */
  message?: string
  /**
   * The value that `expr` must exceed before the alert starts pending.
   * The unit depends on what your expr returns (e.g. percentage, milliseconds, count).
   */
  threshold: number
}

/**
 * Add to this array to create new alerts.
 */
export const ALERTS: Alert[] = [
  {
    id: 'http-5xx-rate',
    name: 'High 5xx error rate',
    expr: 'count_over_time($SELECTOR |= "Request completed" | json | response_statusCode >= 500 [5m]) / count_over_time($SELECTOR |= "Request completed" [5m]) * 100',
    threshold: 5,
    for: '3m',
    slackChannel: '#swain-grafana-testing',
    message: 'More than 5% of HTTP requests are returning 5xx status codes.',
  },
  {
    id: 'http-p99-latency',
    name: 'High p99 latency',
    expr: 'quantile_over_time(0.99, $SELECTOR |= "Request completed" | json | unwrap responseTimeMs [5m])',
    threshold: 2000,
    for: '3m',
    slackChannel: '#swain-grafana-testing',
    message: 'p99 latency has exceeded 2 seconds for 3 minutes.',
  },
]
