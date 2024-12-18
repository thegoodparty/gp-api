type NestedRecords = Record<string, any>

export enum GenerationStatus {
  processing = 'processing',
  completed = 'completed',
}

export type AiContentGenerationStatus = {
  status: GenerationStatus
  createdAt: number
  // TODO: make sure these types are correct
  prompt?: string
  existingChat?: Array<Record<string, string>>
  inputValues?: Record<string, string | boolean | number | undefined>
}

export type CampaignAiContent = NestedRecords & {
  generationStatus?: Record<string, AiContentGenerationStatus>
}
export type CampaignDataContent = NestedRecords & {
  createdBy?: 'admin' | string
}
export type CampaignDetailsContent = NestedRecords & {
  customIssues?: Record<'title' | 'position', string>[]
  runningAgainst?: Record<'name' | 'party' | 'description', string>[]
}
