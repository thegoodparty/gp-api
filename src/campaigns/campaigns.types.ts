export type CampaignPlanVersionData = Record<string, PlanVersion[]>

export type PlanVersion = {
  date: Date | string
  text: string
  language?: string
}

export enum CampaignLaunchStatus {
  launched = 'launched',
}

export enum OnboardingStep {
  complete = 'onboarding-complete',
  registration = 'registration',
}
