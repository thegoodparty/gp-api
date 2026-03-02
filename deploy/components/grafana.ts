import * as grafana from '@pulumiverse/grafana'

export interface GrafanaConfig {
  environment: 'dev' | 'qa' | 'prod'
}

const envLabel = (environment: string) =>
  `service_name="gp-api", deployment_environment_name="${environment}"`

export const createGrafanaResources = ({ environment }: GrafanaConfig) => {
  const folder = new grafana.oss.Folder('alerts-folder', {
    title: `gp-api-${environment}`,
  })

  const promDatasourceUid = 'grafanacloud-prom'
  const labels = envLabel(environment)

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
          datasource: { type: 'prometheus', uid: promDatasourceUid },
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
          datasource: { type: 'prometheus', uid: promDatasourceUid },
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
          datasource: { type: 'prometheus', uid: promDatasourceUid },
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
          datasource: { type: 'prometheus', uid: promDatasourceUid },
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
}
