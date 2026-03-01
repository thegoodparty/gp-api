import { NodeSDK } from '@opentelemetry/sdk-node'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import { ATTR_DEPLOYMENT_ENVIRONMENT_NAME } from '@opentelemetry/semantic-conventions/incubating'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import {
  BatchLogRecordProcessor,
  type LogRecordProcessor,
} from '@opentelemetry/sdk-logs'
import type { SdkLogRecord } from '@opentelemetry/sdk-logs/build/src/export/SdkLogRecord'
import type { Context } from '@opentelemetry/api'
import { PrismaInstrumentation } from '@prisma/instrumentation'
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { HostMetrics } from '@opentelemetry/host-metrics'
import { FastifyOtelInstrumentation } from '@fastify/otel'

/**
 * Why we want this:
 *
 * The default pino instrumentation packages parse the JSON log body, and
 * take this behavior:
 * - send the `msg` key as the log body
 * - send the rest of the keys as attributes/"labels"
 *
 * This is problematic for us, for a few reasons:
 * - Grafana prices based on cardinality of labels
 * - by removing non-msg keys, you can't easily use simple "line contains" queries
 *   (e.g. "show me all logs containing 'error' or '500')
 *
 * By taking this approach, we get:
 * - controlled cost, by reducing label cardinality
 * - ability to use simple "line contains" queries
 * - still flexibilty to do structured queries by just adding a
 *   "json parse" step to any Loki query
 */
class JsonBodyLogRecordProcessor implements LogRecordProcessor {
  constructor(private readonly delegate: LogRecordProcessor) {}

  onEmit(logRecord: SdkLogRecord, context?: Context): void {
    const jsonBody: Record<string, unknown> = {}
    if (logRecord.body !== undefined) {
      jsonBody.msg = logRecord.body
    }
    for (const [key, value] of Object.entries(logRecord.attributes)) {
      jsonBody[key] = value
    }
    logRecord.setBody(JSON.stringify(jsonBody))
    this.delegate.onEmit(logRecord, context)
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush()
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown()
  }
}

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
    logRecordProcessor: new JsonBodyLogRecordProcessor(
      new BatchLogRecordProcessor(
        new OTLPLogExporter({
          url: `${endpoint}/v1/logs`,
          headers: parsedHeaders,
        }),
      ),
    ),
    instrumentations: [
      new HttpInstrumentation(),
      new PrismaInstrumentation(),
      new PinoInstrumentation(),
      fastifyOtelInstrumentation,
    ],
  })

  sdk.start()

  const hostMetrics = new HostMetrics()
  hostMetrics.start()

  process.on('SIGTERM', () => {
    sdk.shutdown().catch((err) => console.error('OTel shutdown error', err))
  })
}
