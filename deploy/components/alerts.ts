import { ControllerName, Endpoint } from '../../src/generated/route-types'
import { Alert, EndpointOverride, SlackGroup } from './alerting/alerts.types'

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
    p95LatencyMs: 999_999,
  },
  'GET /v1/contacts/download': {
    p95LatencyMs: 999_999,
  },
  'GET /v1/organizations': {
    p95LatencyMs: 3_000,
  },
  'POST /v1/polls/analyze-bias': {
    p95LatencyMs: 999_999,
  },
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
    message: [
      'Process CPU utilization has exceeded 80% for 5 minutes.',
      'Click *View in Grafana* to check the CPU & Memory dashboard, and look for recent deployments or traffic spikes that may be driving the increase. If sustained, consider scaling up the service or profiling for hot code paths.',
    ].join('\n\n'),
  },
  {
    slug: 'high-memory',
    name: 'High memory utilization',
    type: 'metric',
    expr: 'avg(system_memory_utilization{service_name="gp-api", deployment_environment_name="$ENV", system_memory_state="used"}) * 100',
    threshold: 90,
    for: '5m',
    message: [
      'System memory utilization has exceeded 90% for 5 minutes.',
      'Click *View in Grafana* to check memory trends on the CPU & Memory dashboard. Look for memory leaks (steadily climbing usage) or a recent deployment that increased baseline consumption. If the service is at risk of OOM, consider restarting it and then investigating the root cause.',
    ].join('\n\n'),
  },
  {
    slug: 'health-check-probe-failure',
    name: 'Health check probe failures',
    type: 'metric',
    expr: '1 - (sum(rate(probe_all_success_sum{job="gp-api-$ENV-health"}[5m])) / sum(rate(probe_all_success_count{job="gp-api-$ENV-health"}[5m])))',
    threshold: 0.1,
    for: '2m',
    message:
      'Synthetic monitoring probes are failing against the health endpoint — the service may be unreachable externally.',
  },
  // ------ Serve Alerts ------ //
  {
    slug: 'serve-background-job-failed',
    name: '[Serve] Background job failed',
    type: 'log',
    expr: 'sum(count_over_time({service_name="gp-api", deployment_environment_name="$ENV"} |= "Message processing failed" |= "poll" [5m]))',
    threshold: 0,
    for: '0m',
    message: [
      'A Serve-related background SQS job has failed in the last 5 minutes.',
      'Click *View in Grafana* to find the failing log lines, then check the associated error message and stack trace to understand what went wrong. Look at the SQS message payload to identify which job failed and whether it can be safely retried.',
    ].join('\n\n'),
    notify: 'serve-bugs',
  },
  // ------ Win Warnings ------ //
  {
    slug: 'win-peerly-warnings',
    name: '[Win] Peerly endpoint errors detected',
    type: 'log',
    expr: [
      'sum(count_over_time(',
      '{service_name="gp-api", deployment_environment_name="$ENV"}',
      // Excluding: happens when users input an incorrect PIN.
      '!= "Campaign Verify Verify PIN API request failed"',
      // Excluding: transient phone list status error, safe to ignore.
      '!= "There may be an error with the phone list for context"',
      '| json',
      '| detected_level = "error"',
      '| request_endpoint =~ ".*(p2p|tcr-compliance|outreach).*"',
      '| request_endpoint != "GET /v1/campaigns/tcr-compliance/mine"',
      // Excluding: HttpExceptionFilter duplicates every error, would double-count.
      '| context != "HttpExceptionFilter"',
      '[15m]))',
    ].join(' '),
    threshold: 0,
    for: '1m',
    message: [
      'Peerly-related endpoint errors detected in the last 15 minutes.',
      'Dashboard: https://goodparty.grafana.net/d/peerly-prod/peerly-e28094-prod',
    ].join('\n\n'),
    notify: 'win-bugs',
  },
]
