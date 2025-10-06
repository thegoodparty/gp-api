import { AxiosRequestConfig, AxiosResponse } from 'axios'
import { HttpException } from '@nestjs/common'
import { Campaign } from '@prisma/client'
import { Observable } from 'rxjs'
export type PeerlyIdentity = {
  identity_id: string
  identity_name: string
  start_date: string
  account_id: string
  tcr_identity_status: string | null
  vetting_expire_date?: string
  usecases?: string[]
}
export type PeerlyIdentityCreateResponseBody = {
  Data: PeerlyIdentity
}

export interface PeerlyCampaignConfig {
  autoRenewal: number
  description: string
  embeddedLink: number
  embeddedPhone: number
  sample1: string
  subscriberOptin: number
  subscriberOptout: number
  usecase: string
  vertical: string
}

export interface PeerlyIdentityProfile {
  account_id: string
  base_account_id: string
  campaignVerifyToken: string | null
  campaigns: Record<string, PeerlyCampaignConfig>
  city: string
  companyName: string
  country: string | null
  displayName: string
  ein: string
  email: string
  entityType: string
  is_political: boolean
  legal_entity_type: string
  phone: string
  postalCode: string
  state: string
  status: string
  street: string
  usecase: string
  vertical?: string
  usecases: string[]
  website: string
  will_send_over_2k: boolean
}

export interface PeerlyIdentityProfileResponseBody {
  link: string
  profile?: PeerlyIdentityProfile
}

export type PeerlyGetIdentitiesResponseBody = {
  identities: PeerlyIdentity[]
}

export interface PeerlyGetCvRequestResponseBody {
  verification_status: string
}
export interface PeerlySubmitCVResponseBody {
  message: string
  verification_id: string
}
export interface Peerly10DlcBrandData {
  entityType: string
  vertical: string
  is_political: boolean
  displayName: string
  companyName: string
  ein: string
  phone: string
  street?: string
  city?: string
  state?: string
  postalCode?: string
  website: string
  email: string
}
export type Peerly10DLCBrandSubmitResponseBody = {
  submission_key: string
}
export type Approve10DLCBrandResponseBody = {
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

// Phone list state enum
export enum PhoneListState {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
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
export enum CampaignVerificationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED',
}

export type PeerlyVerifyCVPinResponse = {
  message: string
  verification_id: string
  cv_verification_status: CampaignVerificationStatus
}

export type PeerlyTcrCampaign = {
  account_id: string
  ageGated: string | null
  att_msg_class: string | null
  att_status: string | null
  att_tpm: string | null
  autoRenewal: number
  create_date: string
  description: string
  directLending: string | null
  embeddedLink: string | null
  embeddedPhone: string | null
  helpMessage: string | null
  is_expired: number
  is_suspended: number
  messageFlow: string | null
  numberPool: string | null
  sample1: string | null
  sample1_media: string | null
  sample2: string | null
  sample2_media: string | null
  sample3: string | null
  sample3_media: string | null
  sample4: string | null
  sample4_media: string | null
  sample5: string | null
  sample5_media: string | null
  subUsecases: string | null
  subscriberHelp: string | null
  subscriberOptin: string | null
  subscriberOptout: string | null
  tcr_brand_id: string
  tcr_campaign_id: string
  tmo_brand_daily_cap: string | null
  tmo_brand_tier: string | null
  tmo_status: string | null
  usc_status: string | null
  usecase: string
  vertical: string
  vz_status: string | null
}

export type PeerlyGetIdentityBrandInfoResponse = {
  account_id: string
  aegis_vetting_score: string
  aegis_vetting_status: string
  cv_vetting_status: string | null
  tcr_brand_id: string
  tcr_campaigns: PeerlyTcrCampaign[]
  tcr_entity_type: string
  tcr_identity_status: string
  tcr_vertical: string
}
export type PeerlyCreateCVTokenResponse = {
  message: string
  campaign_verify_token: string
}
export enum PEERLY_COMMITTEE_TYPE {
  Candidate = 'CA',
}

export enum PEERLY_CV_VERIFICATION_TYPE {
  StateLocal = 'state_local',
}

export type PeerlyIdentityUseCase = {
  identity_id: string
  account_id: string
  usecase: string
  tcr_campaign_id: string
  submitted: number
  activated: number
}

export type PeerlyIdentityUseCaseResponseBody = PeerlyIdentityUseCase[]

type HttpServiceMethod = {
  <T = any, D = any>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): Observable<AxiosResponse<T, D>>
  <T = any, D = any>(
    url: string,
    config?: AxiosRequestConfig<D>,
  ): Observable<AxiosResponse<T, D>>
}

export interface PeerlyHttpRequestConfig {
  url: string
  method: HttpServiceMethod
  data?: unknown
  config?: AxiosRequestConfig
}

type HttpExceptionConstructor<T = {}> = new (message: string) => T

export interface HandleApiErrorParams {
  error: unknown
  requestConfig: PeerlyHttpRequestConfig
  httpExceptionMethod?: HttpExceptionConstructor<HttpException>
  peerlyIdentityId?: string
  campaign: Campaign
}

export interface BuildPeerlyErrorSlackMessageBlocksParams {
  requestConfig: PeerlyHttpRequestConfig
  formattedError: string
  peerlyIdentityId?: string
  campaign: Campaign
}
