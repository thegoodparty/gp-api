import { AiChatMessage } from '../chat/aiChat.types'

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

export type AIQueueMessageData = {
  slug: string
  key: string
  regenerate: boolean | undefined
}
