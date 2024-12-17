import { AiChatMessage } from 'src/ai/ai.types'

// TODO: make sure this type is correct
type AiContentInputValues = Record<
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

export type CampaignAiContent = Record<string, AiContentData> & {
  generationStatus?: Record<string, AiContentGenerationStatus>
  campaignPlanAttempts?: Record<string, number>
}
export type CampaignData = Record<string, any> & {
  createdBy?: 'admin' | string
}
export type CampaignDetails = Record<string, any> & {
  customIssues?: Record<'title' | 'position', string>[]
  runningAgainst?: Record<'name' | 'party' | 'description', string>[]
}
