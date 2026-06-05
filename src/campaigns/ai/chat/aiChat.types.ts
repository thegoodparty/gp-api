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
  // Suggested follow-up questions surfaced after an assistant reply. Persisted
  // on the message so they re-render on thread reload, and echoed in the
  // streaming `done` chunk for the live render.
  followups?: string[]
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
