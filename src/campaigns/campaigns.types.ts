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
