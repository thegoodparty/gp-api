import { Logger } from '@nestjs/common'
import * as newrelic from 'newrelic'
import {
  CustomEventAttributesByType,
  CustomEventType,
  NewRelicEventAttributeValue,
} from './newrelic.events'

const logger = new Logger('NewRelic Client')

type NewRelicApi = Pick<
  typeof newrelic,
  'recordCustomEvent' | 'addCustomAttribute' | 'addCustomAttributes'
>

type NewRelicAttributes = Record<string, NewRelicEventAttributeValue>

function isNewRelicEnabled(): boolean {
  return Boolean(
    process.env.NEW_RELIC_APP_NAME && process.env.NEW_RELIC_LICENSE_KEY,
  )
}

function getApi(): NewRelicApi | null {
  if (!isNewRelicEnabled()) return null
  return newrelic
}

function toNewRelicAttributes(
  attributes: Record<string, unknown>,
): NewRelicAttributes {
  const out: NewRelicAttributes = {}
  for (const [k, v] of Object.entries(attributes)) {
    if (
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'boolean'
    ) {
      out[k] = v
    }
  }
  return out
}

export function recordCustomEvent<T extends CustomEventType>(
  eventType: T,
  attributes: CustomEventAttributesByType[T],
) {
  const api = getApi()
  if (!api) return
  try {
    api.recordCustomEvent(
      eventType,
      toNewRelicAttributes(attributes as Record<string, unknown>),
    )
  } catch (error) {
    logger.error(JSON.stringify(error))
  }
}

export function addCustomAttribute(key: string, value: unknown) {
  const api = getApi()
  if (!api) return
  try {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      api.addCustomAttribute(key, value)
    }
  } catch (error) {
    logger.error(JSON.stringify(error))
  }
}

export function addCustomAttributes(attributes: Record<string, unknown>) {
  const api = getApi()
  if (!api) return
  try {
    api.addCustomAttributes(toNewRelicAttributes(attributes))
  } catch (error) {
    logger.error(JSON.stringify(error))
  }
}
