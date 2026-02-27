import * as grafana from '@pulumiverse/grafana'

export interface GrafanaConfig {
  environment: 'dev' | 'qa' | 'prod'
}

export const createGrafanaResources = ({ environment }: GrafanaConfig) => {
  const folder = new grafana.oss.Folder('alerts-folder', {
    title: `gp-api-${environment}`,
  })

  const promDatasourceUid = 'grafanacloud-prom'

  new grafana.oss.Dashboard('service-dashboard', {
    folder: folder.uid,
    overwrite: true,
    configJson: JSON.stringify({
      title: `gp-api-${environment} - CPU & Memory`,
      uid: `gp-api-${environment}-resources`,
      editable: true,
      timezone: 'browser',
      time: { from: 'now-6h', to: 'now' },
      refresh: '1m',
      panels: [
        {
          id: 1,
          title: 'CPU Usage',
          type: 'timeseries',
          gridPos: { h: 10, w: 12, x: 0, y: 0 },
          datasource: { type: 'prometheus', uid: promDatasourceUid },
          targets: [
            {
              expr: `avg(rate(container_cpu_usage_seconds_total{container=~"gp-api-.*"}[5m])) * 100`,
              legendFormat: 'CPU %',
              refId: 'A',
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
          title: 'Memory Usage',
          type: 'timeseries',
          gridPos: { h: 10, w: 12, x: 12, y: 0 },
          datasource: { type: 'prometheus', uid: promDatasourceUid },
          targets: [
            {
              expr: `avg(container_memory_usage_bytes{container=~"gp-api-.*"})`,
              legendFormat: 'Memory Used',
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
          title: 'Memory Utilization %',
          type: 'gauge',
          gridPos: { h: 8, w: 6, x: 0, y: 10 },
          datasource: { type: 'prometheus', uid: promDatasourceUid },
          targets: [
            {
              expr: `avg(container_memory_usage_bytes{container=~"gp-api-.*"}) / avg(container_spec_memory_limit_bytes{container=~"gp-api-.*"}) * 100`,
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
          title: 'CPU Utilization %',
          type: 'gauge',
          gridPos: { h: 8, w: 6, x: 6, y: 10 },
          datasource: { type: 'prometheus', uid: promDatasourceUid },
          targets: [
            {
              expr: `avg(rate(container_cpu_usage_seconds_total{container=~"gp-api-.*"}[5m])) / avg(container_spec_cpu_quota{container=~"gp-api-.*"} / container_spec_cpu_period{container=~"gp-api-.*"}) * 100`,
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
}
