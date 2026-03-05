import { ControllerName, Endpoint } from '../../src/generated/route-types'
import { Alert, EndpointOverride, SlackGroup } from './alerting/alerts.types'

/** The default threshold for the error rate alert */
export const DEFAULT_ERROR_ALERT_THRESHOLD_PERCENTAGE = 1
export const DEFAULT_P95_READ_LATENCY_MS = 1000
export const DEFAULT_P95_WRITE_LATENCY_MS = 3000

/** Map of slack group to controllers */
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

export const ENDPOINT_OVERRIDES: Partial<Record<Endpoint, EndpointOverride>> = {
  'GET /v1/contacts': {
    p95LatencyMs: 3000,
  },
  // Add more per-endpoint overrides here.
}

export const GLOBAL_ALERTS: Alert[] = [
  // ------ Global Shared Alerts ------ //
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

  // Add more alerts here as you like!
]
