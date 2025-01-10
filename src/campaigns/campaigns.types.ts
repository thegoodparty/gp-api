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

export enum OnboardingStep {
  complete = 'onboarding-complete',
  registration = 'registration',
  onboarding = 'onboarding',
}

export enum CampaignStatus {
  candidate = 'candidate',
  onboarding = 'onboarding',
}

export interface CleanCampaign {
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
