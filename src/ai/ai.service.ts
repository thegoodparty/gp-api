import { ChatOpenAI } from '@langchain/openai'
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai'
import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { AiChatMessage } from './ai.types'

const TOGETHER_AI_KEY = process.env.TOGETHER_AI_KEY //sails.config.custom.togetherAi || sails.config.togetherAi;
const OPEN_AI_KEY = process.env.OPEN_AI_KEY // sails.config.custom.openAi || sails.config.openAi;
const AI_MODELS = process.env.AI_MODELS || '' //sails.config.custom.aiModels || sails.config.aiModels || '';

@Injectable()
export class AiService {
  async llmChatCompletion(
    messages: AiChatMessage[],
    maxTokens: number = 500,
    temperature: number = 1.0,
    topP: number = 0.1,
  ) {
    const models = AI_MODELS.split(',')
    if (models.length === 0) {
      // await sails.helpers.slack.slackHelper(
      //   {
      //     title: 'Error',
      //     body: `AI Models are not configured. Please specify AI models.`,
      //   },
      //   'dev',
      // )

      throw new InternalServerErrorException('AI Models are not configured.')
    }

    const aiOptions = {
      maxTokens,
      temperature,
      topP,
      maxRetries: 0,
    }

    let firstModel
    let fallbackModel
    for (const model of models) {
      if (model.includes('gpt')) {
        if (!firstModel) {
          firstModel = new ChatOpenAI({
            apiKey: OPEN_AI_KEY,
            model,
            ...aiOptions,
          })
        } else {
          fallbackModel = new ChatOpenAI({
            apiKey: OPEN_AI_KEY,
            model,
            ...aiOptions,
          })
        }
      } else {
        if (!firstModel) {
          firstModel = new ChatTogetherAI({
            apiKey: TOGETHER_AI_KEY,
            model,
            ...aiOptions,
          })
        } else {
          fallbackModel = new ChatTogetherAI({
            apiKey: TOGETHER_AI_KEY,
            model,
            ...aiOptions,
          })
        }
      }
    }

    const modelWithFallback = firstModel.withFallbacks([fallbackModel])

    for (let i = 0; i < messages.length; i++) {
      if (messages[i].content !== undefined && messages[i].content.length > 0) {
        // replace invalid characters
        messages[i].content = messages[i].content.replace(/\–/g, '-')
        messages[i].content = messages[i].content.replace(/\`/g, "'")
      }
    }

    let completion
    try {
      completion = await modelWithFallback.invoke(messages)
    } catch (error: any) {
      console.log('Error in utils/ai/llmChatCompletion', error)
      console.log('error response', error?.response)

      // await sails.helpers.slack.errorLoggerHelper(
      //   'Error in AI completion (raw)',
      //   error,
      // )

      throw new InternalServerErrorException('LLM chat completion failed')
    }

    if (completion && completion?.content) {
      let content = completion.content
      if (content.includes('```html')) {
        content = content.match(/```html([\s\S]*?)```/)[1]
      }
      content = content.replace('/n', '<br/><br/>')

      return {
        content,
        tokens: completion?.response_metadata?.tokenUsage?.totalTokens || 0,
      }
    } else {
      return {
        content: '',
        tokens: 0,
      }
    }
  }
}
