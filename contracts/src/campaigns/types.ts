import type {
  BallotReadyPositionLevel,
  CampaignCreatedBy,
  CampaignLaunchStatus,
  ElectionLevel,
  GenerationStatus,
  OnboardingStep,
} from './enums'

export type VoterGoals = {
  doorKnocking?: number
  calls?: number
  digital?: number
  directMail?: number
  digitalAds?: number
  text?: number
  events?: number
  yardSigns?: number
  robocall?: number
  phoneBanking?: number
  socialMedia?: number
}

export type CustomVoterFile = {
  name: string
  channel?: string
  purpose?: string
  filters: string[]
  createdAt: string
}

export type AiChatMessage = {
  role: 'user' | 'system' | 'assistant'
  content: string
  createdAt?: number
  id?: string
  usage?: number
}

export type AiContentInputValues = Record<
  string,
  string | boolean | number | undefined
>

export type AiContentGenerationStatus = {
  status: GenerationStatus
  createdAt: number
  prompt?: string
  existingChat?: AiChatMessage[]
  inputValues?: AiContentInputValues
}

export type AiContentData = {
  name: string
  content: string
  updatedAt: number
  inputValues?: AiContentInputValues
}

export type GeoLocation = {
  geoHash?: string
  lng?: number
  lat?: number
}

export type CustomIssue = {
  title: string
  position: string
}

export type Opponent = {
  name: string
  party: string
  description: string
}

export const HUBSPOT_INCOMING_PROPERTY_VALUES = [
  'past_candidate',
  'incumbent',
  'candidate_experience_level',
  'final_viability_rating',
  'professional_experience',
  'p2p_campaigns',
  'p2p_sent',
  'confirmed_self_filer',
  'date_verified',
  'number_of_opponents',
  'primary_election_result',
  'election_results',
  'verified_candidates',
  'hubspot_owner_id',
  'office_type',
] as const

export type HubSpotIncomingProperty =
  (typeof HUBSPOT_INCOMING_PROPERTY_VALUES)[number]

export type HubSpotUpdates = Partial<Record<HubSpotIncomingProperty, string>>

export type TopIssuePosition = {
  id: number
  name: string
  topIssue: { id: number; name: string; createdAt: number; updatedAt: number }
  createdAt: number
  updatedAt: number
}

export type CampaignFinance = {
  ein?: boolean
  filing?: boolean
  management?: boolean
  regulatory?: boolean
}

export type CampaignPlan = {
  why?: string
  slogan?: string
  aboutMe?: string
  messageBox?: string
  mobilizing?: string
  pathToVictory?: string
  policyPlatform?: string
  communicationsStrategy?: string
}

export type CampaignPlanStatus = {
  status: string
  createdAt: number
}

export type CampaignDetails = {
  state?: string
  ballotLevel?: BallotReadyPositionLevel
  electionDate?: string
  primaryElectionDate?: string
  zip?: string | null
  knowRun?: 'yes' | null
  runForOffice?: 'yes' | 'no' | null
  pledged?: boolean
  isProUpdatedAt?: number
  customIssues?: CustomIssue[]
  runningAgainst?: Opponent[]
  geoLocation?: GeoLocation
  geoLocationFailed?: boolean
  city?: string | null
  county?: string | null
  normalizedOffice?: string | null
  otherOffice?: string
  office?: string
  party?: string
  otherParty?: string
  district?: string
  raceId?: string
  level?: ElectionLevel | null
  noNormalizedOffice?: boolean
  website?: string
  pastExperience?: string | Record<string, string>
  occupation?: string
  funFact?: string
  campaignCommittee?: string
  statementName?: string
  subscriptionId?: string | null
  endOfElectionSubscriptionCanceled?: boolean
  subscriptionCanceledAt?: number | null
  subscriptionCancelAt?: number | null
  filingPeriodsStart?: string | null
  filingPeriodsEnd?: string | null
  officeTermLength?: string
  partisanType?: string
  priorElectionDates?: string[]
  positionId?: string | null
  electionId?: string | null
  tier?: string
  einNumber?: string | null
  einSupportingDocument?: string | null
  wonGeneral?: boolean
  dob?: string
  phone?: string
  firstName?: string
  lastName?: string
  citizen?: string
  runBefore?: string
  filedStatement?: string
  campaignPhone?: string
  campaignWebsite?: string
  officeRunBefore?: string
  articles?: string
  hasPrimary?: boolean
  noCommittee?: boolean
  topIssues?: {
    positions: TopIssuePosition[]
    [key: string]: string | TopIssuePosition[]
  }
} | null

export type CampaignData = {
  createdBy?: CampaignCreatedBy
  slug?: string
  hubSpotUpdates?: HubSpotUpdates
  currentStep?: OnboardingStep
  launchStatus?: CampaignLaunchStatus
  lastVisited?: number
  claimProfile?: string
  customVoterFiles?: CustomVoterFile[]
  reportedVoterGoals?: VoterGoals
  textCampaignCount?: number
  lastStepDate?: string
  adminUserEmail?: string
  hubspotId?: string
  name?: string
  id?: number
  team?: { completed: boolean }
  image?: string
  launch?: Record<string, boolean>
  social?: { completed: boolean }
  finance?: CampaignFinance
  profile?: { completed: boolean }
  campaignPlan?: CampaignPlan
  hasVoterFile?: string
  campaignPlanStatus?: Record<string, CampaignPlanStatus>
  path_to_victory_status?: string
} | null

export type CampaignAiContent = {
  generationStatus?: Record<string, AiContentGenerationStatus>
  campaignPlanAttempts?: Record<string, number>
  [key: string]:
    | AiContentData
    | Record<string, AiContentGenerationStatus>
    | Record<string, number>
    | undefined
}
