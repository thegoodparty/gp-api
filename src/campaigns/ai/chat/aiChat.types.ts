export enum AiChatFeedbackType {
  positive = 'positive',
  negative = 'negative',
}

export type AiChatMessage = {
  role: 'user' | 'system' | 'assistant'
  content: string
  createdAt?: number
  id?: string
  usage?: number
}

export type CampaignChatErrorCode =
  | 'upstream_unavailable'
  | 'rate_limited'
  | 'aborted'
  | 'internal'

export type CampaignChatChunk =
  | { type: 'text'; delta: string }
  | { type: 'done'; threadId: string; message: AiChatMessage }
  | {
      type: 'error'
      code: CampaignChatErrorCode
      message: string
      retryable: boolean
    }
