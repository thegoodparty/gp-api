import { Injectable } from '@nestjs/common'
import { AiChatMessage } from './ai.types'

@Injectable()
export class AiService {
  async llmChatCompletion(
    messages: AiChatMessage[],
    maxTokens: number = 500,
    temperature: number = 1.0,
    topP: number = 0.1,
  ) {
    // TODO: implement
    return Promise.resolve({ content: 'hello', tokens: 123 })
  }
}
