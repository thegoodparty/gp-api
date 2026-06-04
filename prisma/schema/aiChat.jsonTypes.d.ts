import {
  AiChatFeedbackType,
  AiChatMessage,
} from 'src/campaigns/ai/chat/aiChat.types'

export {}

declare global {
  export namespace PrismaJson {
    export type AiChatData = {
      messages: AiChatMessage[]
      // TODO: should feedback be on the individual message instead of on the AIChat object?
      feedback?: { type: AiChatFeedbackType; message?: string }
      // Short, model-generated thread title for the history sidebar (falls back
      // to the first message when absent).
      title?: string
    }
  }
}
