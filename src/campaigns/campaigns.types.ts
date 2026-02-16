import { Prisma } from '@prisma/client'

export type CampaignPlanVersionData = Record<string, PlanVersion[]>

export enum CampaignCreatedBy {
  ADMIN = 'admin',
}

export type PlanVersion = {
  date: Date | string
  text: string
  language?: string
}

// TODO: campaign launchStatus and status could be combined into one status field
export enum CampaignLaunchStatus {
  launched = 'launched',
}

export enum OnboardingStep {
  complete = 'onboarding-complete',
  registration = 'registration',
}

export enum CampaignStatus {
  candidate = 'candidate',
  onboarding = 'onboarding',
}
export type CampaignWith<T extends keyof Prisma.CampaignInclude> =
  Prisma.CampaignGetPayload<{ include: { [field in T]: true } }>

export type CampaignListResponse = Prisma.CampaignGetPayload<{
  include: {
    user: {
      select: {
        firstName: true
        lastName: true
        phone: true
        email: true
        metaData: true
      }
    }
    pathToVictory: {
      select: {
        data: true
      }
    }
  }
}>

export type CampaignWithPathToVictory = Prisma.CampaignGetPayload<{
  include: {
    pathToVictory: true
  }
}>

// TODO: this should be based off CampaignUpdateHistoryType, we're having to change these in too many places
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

export enum ElectionLevel {
  state = 'state',
  county = 'county',
  federal = 'federal',
  city = 'city',
}

export enum BallotReadyPositionLevel {
  CITY = 'CITY',
  COUNTY = 'COUNTY',
  FEDERAL = 'FEDERAL',
  LOCAL = 'LOCAL',
  REGIONAL = 'REGIONAL',
  STATE = 'STATE',
  TOWNSHIP = 'TOWNSHIP',
}

export interface UpdateCampaignFieldsInput {
  data?: Record<string, unknown>
  details?: Record<string, unknown>
  pathToVictory?: Record<string, unknown>
  aiContent?: Record<string, unknown>
  formattedAddress?: string | null
  placeId?: string | null
  canDownloadFederal?: boolean
}
