import { HttpException, HttpExceptionOptions } from '@nestjs/common'
import { Campaign } from '@prisma/client'

export type PeerlyIdentity = {
  identity_id: string
  identity_name: string
  start_date: string
  account_id: string
  tcr_identity_status: string | null
  vetting_expire_date?: string
  usecases?: string[]
}
export type PeerlyJobArea = {
  didState?: string
  didNpaSubset?: string[]
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
  jobAreas?: PeerlyJobArea[]
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

/** Full brand data returned by the Peerly approve 10DLC endpoint. */
export type BrandApprovalResult = Omit<
  Approve10DLCBrandResponseBody,
  'campaign_verify_token'
>

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
  campaign_verify_token: string
}

export enum PeerlyCvVerificationStatus {
  REQUESTED = 'REQUESTED',
  IN_REVIEW = 'IN_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
}

// TODO: make this an enum once we have the answer to this question:
//  https://goodpartyorg.slack.com/archives/C09H3K02LLV/p1759423143435669
export type PeerlyRetrieveCampaignVerifyStatusResponseBody = {
  verification_status: PeerlyCvVerificationStatus
}
export enum PeerlyCommitteeType {
  House = 'H',
  Senate = 'S',
  Presidential = 'P',
  Candidate = 'CA',
}

export enum PeerlyCvVerificationType {
  StateLocal = 'state_local',
  Federal = 'federal',
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

export type HttpExceptionConstructor = new (
  message: string,
  options?: HttpExceptionOptions,
) => HttpException

export interface PeerlyAuthenticatedUser {
  user_id: number
  last_name: string
  email: string
  user_type: string
  identities: PeerlyIdentity[]
  first_name: string
  local_timezone: string
}

export enum PeerlyJobStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  DELETED = 'deleted',
  PENDING = 'pending',
  ERROR = 'error',
}

export interface PeerlyJob {
  id: string
  account_id: string
  identity_id: string
  name: string
  internal_name: string
  status: PeerlyJobStatus
  job_type: string
  created_date: string
  created_by: string
  last_touched_date: string
  start_date: string
  end_date: string
  schedule_id: number
  did_state: string
  did_npa_subset: string[]
  disable_did_purchase: boolean
  can_use_mms: boolean
  ai_enabled: boolean
  ai_auto_opt_out_threshold: string
  deliverability_check: boolean
  deliverability_check_error?: string
  dynamic_reassignment: boolean
  can_add_new_lead: boolean
  has_canvassers_scheduled: boolean
  leads_remaining: number
  agent_ids: string[]
  agents: Record<string, never>
  phone_lists: number[]
  phone_list_assignments: Array<{
    list_id: number
    deduplicate: boolean
  }>
  suppression_list_assignments: string[]
  templates: Array<{
    id: string
    title: string
    text: string
    is_default: boolean
    has_dynamic_media: boolean
    has_dynamic_media_rendered: boolean
    media?: {
      media_id: string
      media_type: string
      title: string
    }
    advanced?: {
      show_stop: boolean
      organization?: string
      bodies?: string[]
      minimized?: boolean
      call_to_actions?: Array<{
        text: string
        url?: string
      }>
    }
  }>
  canvassers_schedule?: {
    requested_initials: string
    requested_date: string
    requested_at: string
    requested_start_time: string
    requested_end_time: string
    requested_timezone: string
    requested_timeframe: string
    requested_by: string
    start_time: string
    end_time: string
    approved: boolean
  }
  questions: string[]
  tracked_links: string[]
  integrations: string[]
}

export interface PeerlyJobTemplate {
  is_default: boolean
  title: string
  text: string
  advanced?: {
    show_stop: boolean
    organization?: string
    bodies?: Array<{
      text: string
    }>
    call_to_actions?: Array<{
      text: string
      url?: string
    }>
  }
  media?: {
    media_type: string
    media_id: string
    title: string
  }
}

export interface CreateJobParams {
  name: string
  templates: PeerlyJobTemplate[]
  didState: string
  didNpaSubset?: string[]
  identityId?: string
  scheduledDate?: string
  scheduleId: number
}

export type PeerlyRecoveryInfo = Record<string, string | number | undefined>

export interface PeerlyApiErrorContext {
  campaign?: Campaign
  peerlyIdentityId?: string
  httpExceptionClass?: HttpExceptionConstructor
  customMessage?: string
  recoveryInfo?: PeerlyRecoveryInfo
}
