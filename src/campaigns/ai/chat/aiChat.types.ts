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
