import { AiChatMessage } from 'src/ai/ai.types'

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
