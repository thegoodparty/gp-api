import { BlockedStateRootCause } from '../blockedState/blockedState.types'

export enum CustomEventType {
  BlockedState = 'BlockedState',
}

/**
 * New Relic custom-event attribute values must be primitives.
 * (`@types/newrelic` restricts to string|number|boolean.)
 */
export type NewRelicEventAttributeValue = string | number | boolean

export type BlockedStateEventAttributes = {
  service: 'gp-api'
  environment?: string
  userId: number

  // HTTP context (for request/response driven events)
  endpoint?: string
  method?: string
  statusCode?: number
  errorClass?: string
  errorMessage?: string
  errorCode?: string | number

  // Classification
  rootCause: BlockedStateRootCause
  isBackground: boolean

  // Optional domain context
  campaignId?: number
  slug?: string
  feature?: string

  // Optional debug/extra attributes
  p2vAttempts?: number
  reason?: string
}

export type CustomEventAttributesByType = {
  [CustomEventType.BlockedState]: BlockedStateEventAttributes
}
