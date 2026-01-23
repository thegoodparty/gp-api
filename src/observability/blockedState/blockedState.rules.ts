import {
  BlockedStateDecisionInput,
  BlockedStateErrorCode,
  BlockedStateRootCause,
} from './blockedState.types'

export const BLOCKED_STATE_ALLOWLIST_ERROR_CODES = Object.freeze([
  // Contacts: known “user can’t proceed” data integrity issues.
  'DATA_INTEGRITY_P2V_ELECTION_INFO_MISSING',
  'DATA_INTEGRITY_CAMPAIGN_DETAILS_MISSING',
  'DATA_INTEGRITY_CAMPAIGN_STATE_INVALID',

  // Billing/subscription management: data linkage missing.
  'BILLING_CUSTOMER_ID_MISSING',

  // Website domains: payment linkage missing.
  'BILLING_DOMAIN_PAYMENT_ID_MISSING',
] satisfies readonly BlockedStateErrorCode[])

const allowlistCodeSet = new Set<string>(
  BLOCKED_STATE_ALLOWLIST_ERROR_CODES as readonly string[],
)

export function shouldRecordBlockedState(
  input: BlockedStateDecisionInput,
): boolean {
  const { statusCode, errorCode } = input

  if (
    statusCode >= 500 ||
    (typeof errorCode === 'string' && allowlistCodeSet.has(errorCode))
  )
    return true

  return false
}

export function deriveRootCause(params: {
  errorMessage: string
  statusCode: number
  errorCode?: string | number | null
}): BlockedStateRootCause {
  const message = (params.errorMessage || '').toLowerCase()
  const code = String(params.errorCode ?? '').toLowerCase()

  if (message.includes('people api')) return 'dependency_people_api'
  if (message.includes('stripe') || code.includes('stripe'))
    return 'dependency_stripe'
  if (message.includes('peerly')) return 'dependency_peerly'
  if (message.includes('vercel')) return 'dependency_vercel'

  if (
    params.errorCode === 'BILLING_CUSTOMER_ID_MISSING' ||
    params.errorCode === 'BILLING_DOMAIN_PAYMENT_ID_MISSING'
  ) {
    return 'data_integrity_billing'
  }

  if (
    typeof params.errorCode === 'string' &&
    allowlistCodeSet.has(params.errorCode)
  ) {
    return 'data_integrity_campaign'
  }

  return params.statusCode >= 500 ? 'internal_unknown' : 'internal_unknown'
}
