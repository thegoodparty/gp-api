export type BlockedStateRootCause =
  | 'dependency_people_api'
  | 'dependency_stripe'
  | 'dependency_peerly'
  | 'dependency_vercel'
  | 'data_integrity_campaign'
  | 'data_integrity_billing'
  | 'p2v_failed'
  | 'internal_unknown'

export type BlockedStateErrorCode =
  | 'DATA_INTEGRITY_P2V_ELECTION_INFO_MISSING'
  | 'DATA_INTEGRITY_CAMPAIGN_DETAILS_MISSING'
  | 'DATA_INTEGRITY_CAMPAIGN_STATE_INVALID'
  | 'BILLING_CUSTOMER_ID_MISSING'
  | 'BILLING_DOMAIN_PAYMENT_ID_MISSING'

export type BlockedStateDecisionInput = {
  statusCode: number
  errorMessage: string
  errorCode?: string | number | null
}
