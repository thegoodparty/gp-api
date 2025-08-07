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

// Media status enum
export enum MediaStatus {
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS', // Inferred - likely success status
  PROCESSING = 'PROCESSING', // Inferred - likely processing status
}

// Media type enum
export enum MediaType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
}

// P2P SMS API types
export type PhoneListUploadResponse = {
  token: string
}

export type PhoneListStatusResponse = {
  list_status: string
  list_id?: number
}

export type MediaCreateResponse = {
  media_id: string
  status?: MediaStatus
  error?: string
}

export type P2pJobCreateResponse = {
  job_id: string
}

export type P2pTemplate = {
  title: string
  text: string
  is_default?: boolean
  advanced?: {
    media: {
      media_id: string
      media_type: MediaType
      preview_url?: string
      thumbnail_url?: string
      title?: string
    }
  }
}
