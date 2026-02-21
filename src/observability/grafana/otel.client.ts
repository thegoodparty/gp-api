import { Logger } from '@nestjs/common'
import { metrics, trace } from '@opentelemetry/api'
import { BlockedStateEventAttributes } from '@/observability/newrelic/newrelic.events'

const logger = new Logger('OTel Client')

const isOtelEnabled = (): boolean =>
  Boolean(
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT &&
      process.env.OTEL_EXPORTER_OTLP_HEADERS,
  )

const blockedStateCounter = metrics
  .getMeter('gp-api')
  .createCounter('blocked_state.count', {
    description: 'Count of blocked state events by root cause',
  })

export const recordBlockedStateEvent = (
  attributes: BlockedStateEventAttributes,
): void => {
  if (!isOtelEnabled()) return

  try {
    const span = trace.getActiveSpan()
    if (span) {
      span.addEvent('BlockedState', {
        'blocked_state.service': attributes.service,
        'blocked_state.root_cause': attributes.rootCause,
        'blocked_state.is_background': attributes.isBackground,
        'blocked_state.user_id': attributes.userId,
        ...(attributes.endpoint
          ? { 'blocked_state.endpoint': attributes.endpoint }
          : {}),
        ...(attributes.errorMessage
          ? { 'blocked_state.error_message': attributes.errorMessage }
          : {}),
        ...(attributes.campaignId
          ? { 'blocked_state.campaign_id': attributes.campaignId }
          : {}),
        ...(attributes.slug ? { 'blocked_state.slug': attributes.slug } : {}),
        ...(attributes.feature
          ? { 'blocked_state.feature': attributes.feature }
          : {}),
      })
    }

    blockedStateCounter.add(1, {
      rootCause: attributes.rootCause,
      isBackground: String(attributes.isBackground),
      environment: attributes.environment ?? 'unknown',
    })
  } catch (error) {
    logger.error('Failed to record OTel blocked state event', error)
  }
}
