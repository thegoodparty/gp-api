import { NodeSDK } from '@opentelemetry/sdk-node'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import { ATTR_DEPLOYMENT_ENVIRONMENT_NAME } from '@opentelemetry/semantic-conventions/incubating'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { PrismaInstrumentation } from '@prisma/instrumentation'
import { FastifyOtelInstrumentation } from '@fastify/otel'

const headers = process.env.OTEL_EXPORTER_OTLP_HEADERS

declare global {
  // eslint-disable-next-line no-var
  var __fastifyOtelInstrumentation: FastifyOtelInstrumentation | undefined
}

if (!headers) {
  console.warn('OpenTelemetry disabled: Missing OTEL_EXPORTER_OTLP_HEADERS')
} else {
  const endpoint = 'https://otlp-gateway-prod-us-east-3.grafana.net/otlp'
  const fastifyOtelInstrumentation = new FastifyOtelInstrumentation()
  global.__fastifyOtelInstrumentation = fastifyOtelInstrumentation

  const parsedHeaders = Object.fromEntries(
    headers.split(',').map((pair) => {
      const idx = pair.indexOf('=')
      return [pair.slice(0, idx), pair.slice(idx + 1)]
    }),
  )

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'gp-api',
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]:
      process.env.OTEL_SERVICE_ENVIRONMENT || 'local',
  })

  const sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
      headers: parsedHeaders,
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${endpoint}/v1/metrics`,
        headers: parsedHeaders,
      }),
      exportIntervalMillis: 60_000,
    }),
    logRecordProcessor: new BatchLogRecordProcessor(
      new OTLPLogExporter({
        url: `${endpoint}/v1/logs`,
        headers: parsedHeaders,
      }),
    ),
    instrumentations: [new PrismaInstrumentation()],
  })

  sdk.start()

  process.on('SIGTERM', () => {
    sdk.shutdown().catch((err) => console.error('OTel shutdown error', err))
  })
}
