import * as grafana from '@pulumiverse/grafana'
import { ALERTS } from './alerts'

export interface GrafanaConfig {
  environment: 'dev' | 'qa' | 'prod'
  slackBotToken: string
}

const LOKI_DATASOURCE_UID = 'grafanacloud-logs'
const PROM_DATASOURCE_UID = 'grafanacloud-prom'

export const createGrafanaResources = ({
  environment,
  slackBotToken,
}: GrafanaConfig) => {
  const folder = new grafana.oss.Folder('alerts-folder', {
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

  for (const alert of ALERTS) {
    let text =
      '{{ .CommonAnnotations.summary }}\n{{ .CommonAnnotations.description }}'
    if (alert.message) {
      text = `${text}\n${alert.message}`
    }

    // it's a little weird to create a dedicated contact point and notification policy for each alert.
    // but, for now, it's not 100% clear where we want to send alerts, who will respond, etc.
    // this allows people to experiment while we figure out the best way to handle alerts as a team
    const contactPoint = new grafana.alerting.ContactPoint(`cp-${alert.id}`, {
      name: `gp-api-${environment}-${alert.id}`,
      slacks: [
        {
          token: slackBotToken,
          recipient: alert.slackChannel,
          title: `[${environment}] {{ .CommonLabels.alertname }}`,
          text,
        },
      ],
    })

    new grafana.alerting.NotificationPolicy(`np-${alert.id}`, {
      groupBies: ['alertname'],
      contactPoint: contactPoint.name,
      policies: [
        {
          contactPoint: contactPoint.name,
          matchers: [
            { label: 'alert_id', match: '=', value: alert.id },
            { label: 'environment', match: '=', value: environment },
          ],
          groupWait: '30s',
          groupInterval: '5m',
          repeatInterval: '30m',
        },
      ],
    })

    new grafana.alerting.RuleGroup(`rg-${alert.id}`, {
      name: `gp-api-${environment}-${alert.id}`,
      folderUid: folder.uid,
      intervalSeconds: 60,
      rules: [
        {
          name: alert.name,
          condition: 'threshold',
          for: alert.for,
          noDataState: 'OK',
          execErrState: 'Alerting',
          annotations: {
            summary: alert.name,
            ...(alert.message ? { description: alert.message } : {}),
          },
          labels: {
            service: 'gp-api',
            environment,
            alert_id: alert.id,
          },
          datas: [
            {
              refId: 'A',
              queryType: 'range',
              relativeTimeRange: { from: 600, to: 0 },
              datasourceUid: LOKI_DATASOURCE_UID,
              model: JSON.stringify({
                expr: alert.expr.replace(
                  /\$SELECTOR/g,
                  `{service_name="gp-api", deployment_environment_name="${environment}"}`,
                ),
                refId: 'A',
              }),
            },
            {
              refId: 'threshold',
              queryType: '',
              relativeTimeRange: { from: 0, to: 0 },
              datasourceUid: '-100',
              model: JSON.stringify({
                type: 'threshold',
                refId: 'threshold',
                conditions: [
                  {
                    evaluator: { type: 'gt', params: [alert.threshold] },
                    operator: { type: 'and' },
                    query: { params: ['A'] },
                    reducer: { type: 'last', params: [] },
                    type: 'query',
                  },
                ],
                datasource: { type: '__expr__', uid: '-100' },
              }),
            },
          ],
        },
      ],
    })
  }
}
