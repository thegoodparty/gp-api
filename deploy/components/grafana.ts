import * as grafana from '@pulumiverse/grafana'
import { ALERTS, SlackGroup } from './alerts'

export interface GrafanaConfig {
  environment: 'dev' | 'qa' | 'prod'
}

const LOKI_DATASOURCE_UID = 'grafanacloud-logs'
const PROM_DATASOURCE_UID = 'grafanacloud-prom'

const SLACK_GROUP_IDS: Record<SlackGroup, string> = {
  'serve-bugs': 'S0AD54G9D3K',
  'win-bugs': 'S0AE3NTCXM3',
}

export const createGrafanaResources = ({ environment }: GrafanaConfig) => {
  const folder = new grafana.oss.Folder('gp-api-folder', {
    title: `gp-api-${environment}`,
  })

  const labels = `service_name="gp-api", deployment_environment_name="${environment}"`

  new grafana.oss.Dashboard('service-dashboard', {
    folder: folder.uid,
    overwrite: true,
    configJson: JSON.stringify({
      title: `gp-api ${environment} - CPU & Memory`,
      uid: `gp-api-${environment}-resources`,
      editable: true,
      timezone: 'browser',
      time: { from: 'now-6h', to: 'now' },
      refresh: '1m',
      panels: [
        {
          id: 1,
          title: 'Process CPU Utilization',
          type: 'timeseries',
          gridPos: { h: 10, w: 12, x: 0, y: 0 },
          datasource: { type: 'prometheus', uid: PROM_DATASOURCE_UID },
          targets: [
            {
              expr: `avg(process_cpu_utilization{${labels}}) * 100`,
              legendFormat: 'Process CPU %',
              refId: 'A',
            },
            {
              expr: `avg(system_cpu_utilization{${labels}}) * 100`,
              legendFormat: 'System CPU %',
              refId: 'B',
            },
          ],
          fieldConfig: {
            defaults: {
              unit: 'percent',
              min: 0,
              custom: { fillOpacity: 10, lineWidth: 2 },
            },
            overrides: [],
          },
        },
        {
          id: 2,
          title: 'Process Memory Usage',
          type: 'timeseries',
          gridPos: { h: 10, w: 12, x: 12, y: 0 },
          datasource: { type: 'prometheus', uid: PROM_DATASOURCE_UID },
          targets: [
            {
              expr: `process_memory_usage{${labels}}`,
              legendFormat: 'Process Memory',
              refId: 'A',
            },
          ],
          fieldConfig: {
            defaults: {
              unit: 'bytes',
              min: 0,
              custom: { fillOpacity: 10, lineWidth: 2 },
            },
            overrides: [],
          },
        },
        {
          id: 3,
          title: 'System Memory Utilization',
          type: 'gauge',
          gridPos: { h: 8, w: 6, x: 0, y: 10 },
          datasource: { type: 'prometheus', uid: PROM_DATASOURCE_UID },
          targets: [
            {
              expr: `avg(system_memory_utilization{${labels}, system_memory_state="used"}) * 100`,
              legendFormat: 'Memory %',
              refId: 'A',
            },
          ],
          fieldConfig: {
            defaults: {
              unit: 'percent',
              min: 0,
              max: 100,
              thresholds: {
                steps: [
                  { color: 'green', value: null },
                  { color: 'yellow', value: 70 },
                  { color: 'red', value: 90 },
                ],
              },
            },
            overrides: [],
          },
        },
        {
          id: 4,
          title: 'System CPU Utilization',
          type: 'gauge',
          gridPos: { h: 8, w: 6, x: 6, y: 10 },
          datasource: { type: 'prometheus', uid: PROM_DATASOURCE_UID },
          targets: [
            {
              expr: `avg(system_cpu_utilization{${labels}}) * 100`,
              legendFormat: 'CPU %',
              refId: 'A',
            },
          ],
          fieldConfig: {
            defaults: {
              unit: 'percent',
              min: 0,
              max: 100,
              thresholds: {
                steps: [
                  { color: 'green', value: null },
                  { color: 'yellow', value: 70 },
                  { color: 'red', value: 90 },
                ],
              },
            },
            overrides: [],
          },
        },
      ],
    }),
  })

  // Alerts are only enabled in prod for now
  if (environment !== 'prod') {
    return
  }

  const datasourceConfig = {
    log: { uid: LOKI_DATASOURCE_UID, queryType: 'range' },
    metric: { uid: PROM_DATASOURCE_UID, queryType: 'instant' },
  } as const

  const alertFolder = new grafana.oss.Folder('alerts-folder', {
    title: `Alerts (provisioned via gp-api)`,
  })

  new grafana.alerting.RuleGroup('rules', {
    name: 'All Rules',
    folderUid: alertFolder.uid,
    intervalSeconds: 60,
    rules: ALERTS.map((alert) => ({
      name: alert.name,
      condition: 'C',
      for: alert.for,
      isPaused: alert.disabled ?? false,
      noDataState: 'OK',
      execErrState: 'Alerting',
      annotations: {
        summary: alert.name,
        description: [
          alert.message,
          alert.notify ? `<!subteam^${SLACK_GROUP_IDS[alert.notify]}>` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
      labels: {
        environment,
        alert_slug: alert.slug,
      },
      datas: [
        {
          refId: 'A',
          queryType: datasourceConfig[alert.type].queryType,
          relativeTimeRange: { from: 600, to: 0 },
          datasourceUid: datasourceConfig[alert.type].uid,
          model: JSON.stringify({
            expr: alert.expr.replace(/\$ENV/g, environment),
            refId: 'A',
          }),
        },
        {
          refId: 'B',
          queryType: '',
          relativeTimeRange: { from: 0, to: 0 },
          datasourceUid: '-100',
          model: JSON.stringify({
            type: 'reduce',
            refId: 'B',
            expression: 'A',
            reducer: 'last',
            settings: { mode: '' },
            datasource: { type: '__expr__', uid: '-100' },
          }),
        },
        {
          refId: 'C',
          queryType: '',
          relativeTimeRange: { from: 0, to: 0 },
          datasourceUid: '-100',
          model: JSON.stringify({
            type: 'threshold',
            refId: 'C',
            expression: 'B',
            conditions: [
              {
                evaluator: { type: 'gt', params: [alert.threshold] },
                operator: { type: 'and' },
                query: { params: ['B'] },
                reducer: { type: 'last', params: [] },
                type: 'query',
              },
            ],
            datasource: { type: '__expr__', uid: '-100' },
          }),
        },
      ],
    })),
  })
}
