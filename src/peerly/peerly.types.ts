export type PeerlyIdentityCreateResponseBody = {
  Data: {
    identity_id: string
    identity_name: string
    start_date: string
    account_id: string
    tcr_identity_status: string | null
  }
}
export type PeerlySubmitIdentityProfileResponseBody = {
  link: string
}
export type Peerly10DLCBrandSubmitResponseBody = {
  submission_key: string
}
export type Approve10DLCBrandResponse = {
  street: string
  usecases: string[]
  phone: string
  legal_entity_type: string
  account_id: string
  companyName: string
  country: string
  postalCode: string
  entityType: string
  base_account_id: string
  email: string
  state: string
  vertical: string
  is_political: boolean
  website: string
  ein: string
  sample1: string
  displayName: string
  status: string
  entity_type: string
  city: string
  usecase: string
  sample2: string
  campaign_verify_token: string
}
