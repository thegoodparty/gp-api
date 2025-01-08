import { AiChatMessage } from './ai/chat/aiChat.types'

export type CampaignPlanVersionData = Record<string, AiContentVersion[]>

export type AiContentVersion = {
  date: Date | string
  text: string
  language?: string
}

// TODO: make sure this type is correct
export type AiContentInputValues = Record<
  string,
  string | boolean | number | undefined
>

export type CampaignDataContent = {
  createdBy?: 'admin' | string
  hubSpotUpdates?: {
    verified_candidates?: string
    election_results?: string
    office_type?: string
  }
}

export type CampaignDetailsContent = {
  geoLocation?: {
    lng?: number
    lat?: number
  }
  geoLocationFailed?: boolean
  zip?: string
  electionDate?: string
  party?: string
  state?: string
  ballotLevel?: string
  city: string | null
  county: string | null
  normalizedOffice?: string | null
}

export enum GenerationStatus {
  processing = 'processing',
  completed = 'completed',
}

export type AiContentGenerationStatus = {
  status: GenerationStatus
  createdAt: number
  prompt?: string
  existingChat?: Array<AiChatMessage>
  inputValues?: AiContentInputValues
}

export type AiContentData = {
  name: string
  content: string
  updatedAt: number
  inputValues?: AiContentInputValues
}

export enum CampaignLaunchStatus {
  launched = 'launched',
}

export enum OnboardingStep {
  complete = 'onboarding-complete',
  registration = 'registration',
}

export type CampaignAiContent = Record<string, AiContentData> & {
  generationStatus?: Record<string, AiContentGenerationStatus>
  campaignPlanAttempts?: Record<string, number>
}
export type CampaignData = Record<string, any> & {
  createdBy?: 'admin' | string
  launchStatus?: CampaignLaunchStatus
  currentStep?: OnboardingStep
}
export type CampaignDetails = Record<string, any> & {
  customIssues?: Record<'title' | 'position', string>[]
  runningAgainst?: Record<'name' | 'party' | 'description', string>[]
}

export function isRecord<T extends object>(
  value: unknown,
): value is Record<string, T> {
  return typeof value === 'object' && value !== null
}

export interface CampaignUpdate {
  slug: string
  id: string
  didWin: boolean | null
  office: string | null
  state: string | null
  ballotLevel: string | null
  zip: string | null
  party: string | null
  firstName: string
  lastName: string
  avatar: string | boolean
  electionDate: string | null
  county: string | null
  city: string | null
  normalizedOffice?: string | null
  globalPosition?: { lng: number; lat: number }
}
