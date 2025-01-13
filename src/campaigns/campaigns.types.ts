import { Prisma } from '@prisma/client'

export type CampaignPlanVersionData = Record<string, PlanVersion[]>

export type PlanVersion = {
  date: Date | string
  text: string
  language?: string
}

// TODO: campaign launchStatus and status could be combined into one status field
export enum CampaignLaunchStatus {
  launched = 'launched',
}

export enum CampaignStatus {
  candidate = 'candidate',
  onboarding = 'onboarding',
}

export enum OnboardingStep {
  complete = 'onboarding-complete',
  registration = 'registration',
}
