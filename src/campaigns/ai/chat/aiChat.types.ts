export enum AiChatFeedbackType {
  positive = 'positive',
  negative = 'negative',
}

export type AiChatMessage = {
  role: 'user' | 'system' | 'assistant'
  content: string
  createdAt?: number
  // messageId?: string
  id?: string
  usage?: number
}

export type AiChatData = {
  messages: AiChatMessage[]
  // TODO: should feedback be on the individual message instead of on the AIChat object?
  feedback?: { type: AiChatFeedbackType; message?: string }
}
