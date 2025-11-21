import { Injectable, Logger } from '@nestjs/common'
import retry from 'async-retry'
import { OpenAI } from 'openai'
import {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionNamedToolChoice,
  ChatCompletionTool,
} from 'openai/resources/chat/completions'

const { TOGETHER_AI_KEY, AI_MODELS = '' } = process.env

if (!TOGETHER_AI_KEY) {
  throw new Error('Please set TOGETHER_AI_KEY in your .env')
}
if (!AI_MODELS) {
  throw new Error('Please set AI_MODELS in your .env')
}

export interface LlmChatCompletionOptions {
  messages: ChatCompletionMessageParam[]
  model?: string
  temperature?: number
  topP?: number
  maxTokens?: number
  timeout?: number
  userId?: string
  retries?: number
  fallbackModels?: string[]
}

export interface LlmToolCompletionOptions extends LlmChatCompletionOptions {
  tools?: ChatCompletionTool[]
  toolChoice?: ChatCompletionNamedToolChoice
}

export interface LlmCompletionResult {
  content: string
  tokens: number
  model?: string
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name)
  private readonly defaultModels: string[]
  private readonly defaultRetries = 3
  private readonly defaultTimeout = 300000
  private readonly client: OpenAI

  constructor() {
    this.defaultModels = AI_MODELS.split(',').filter((m) => m.trim())
    if (this.defaultModels.length === 0) {
      throw new Error('AI_MODELS must contain at least one model')
    }

    // We use the OpenAI SDK to call the TogetherAI API
    this.client = new OpenAI({
      apiKey: TOGETHER_AI_KEY,
      baseURL: 'https://api.together.xyz/v1',
    })
  }

  /**
   * Creates a chat completion using the specified model with automatic retries and fallbacks.
   * Supports token caching via userId for compatible APIs.
   */
  async chatCompletion(
    options: LlmChatCompletionOptions,
  ): Promise<LlmCompletionResult> {
    const {
      messages,
      model,
      temperature = 0.7,
      topP = 1.0,
      maxTokens,
      timeout = this.defaultTimeout,
      userId,
      retries = this.defaultRetries,
      fallbackModels,
    } = options

    const models = this.prepareModelList(model, fallbackModels)

    return retry(
      async () => {
        let lastError: Error | undefined
        for (let i = 0; i < models.length; i++) {
          const currentModel = models[i]
          try {
            const result = await this.callChatCompletion({
              model: currentModel,
              messages,
              temperature,
              topP,
              maxTokens,
              timeout,
              userId,
            })

            return {
              ...result,
              model: currentModel,
            }
          } catch (error) {
            lastError =
              error instanceof Error ? error : new Error(String(error))
            this.logger.warn(
              `Model ${currentModel} failed, ${i < models.length - 1 ? 'trying fallback' : 'no more fallbacks'}`,
              lastError,
            )

            if (i === models.length - 1) {
              throw lastError
            }
          }
        }
        throw lastError || new Error('All models failed')
      },
      {
        retries,
        onRetry: (error, attempt) => {
          this.logger.warn(
            `Chat completion attempt ${attempt} failed, retrying...`,
            error,
          )
        },
      },
    )
  }

  /**
   * Creates a chat completion with tool/function calling support.
   * Supports automatic retries, model fallbacks, and token caching.
   */
  async toolCompletion(
    options: LlmToolCompletionOptions,
  ): Promise<LlmCompletionResult> {
    const {
      messages,
      tools,
      toolChoice,
      model,
      temperature = 0.1,
      topP = 0.1,
      maxTokens,
      timeout = this.defaultTimeout,
      userId,
      retries = this.defaultRetries,
      fallbackModels,
    } = options

    if (!tools || tools.length === 0) {
      throw new Error('Tools must be provided for tool completion')
    }

    const models = this.prepareModelList(model, fallbackModels)

    return retry(
      async () => {
        let lastError: Error | undefined
        for (let i = 0; i < models.length; i++) {
          const currentModel = models[i]
          try {
            const result = await this.callToolCompletion({
              model: currentModel,
              messages,
              tools,
              toolChoice,
              temperature,
              topP,
              maxTokens,
              timeout,
              userId,
            })

            return {
              ...result,
              model: currentModel,
            }
          } catch (error) {
            lastError =
              error instanceof Error ? error : new Error(String(error))
            this.logger.warn(
              `Model ${currentModel} failed for tool completion, ${i < models.length - 1 ? 'trying fallback' : 'no more fallbacks'}`,
              lastError,
            )

            if (i === models.length - 1) {
              throw lastError
            }
          }
        }
        throw lastError || new Error('All models failed')
      },
      {
        retries,
        onRetry: (error, attempt) => {
          this.logger.warn(
            `Tool completion attempt ${attempt} failed, retrying...`,
            error,
          )
        },
      },
    )
  }

  /**
   * Prepares a list of models for fallback, using the provided model or default models.
   * Utility function for building model fallback chains.
   */
  prepareModelList(primaryModel?: string, fallbackModels?: string[]): string[] {
    const models: string[] = []

    if (primaryModel) {
      models.push(primaryModel)
    }

    if (fallbackModels && fallbackModels.length > 0) {
      models.push(...fallbackModels)
    } else if (!primaryModel) {
      models.push(...this.defaultModels)
    }

    return models.length > 0 ? models : this.defaultModels
  }

  /**
   * Prepares user identification for token caching.
   * TogetherAI API uses this to cache usage and avoid duplicate token charges.
   * Utility function for building user identification objects.
   */
  prepareUserIdentification(userId?: string): { user?: string } {
    return userId ? { user: userId } : {}
  }

  /**
   * Sanitizes message content by replacing problematic characters.
   * Utility function for message preprocessing.
   */
  sanitizeMessageContent(content: string): string {
    let sanitized = content
    sanitized = sanitized.replace(/\–/g, '-')
    sanitized = sanitized.replace(/\`/g, "'")
    return sanitized
  }

  /**
   * Sanitizes an array of messages by cleaning their content.
   * Utility function for message preprocessing.
   */
  sanitizeMessages(
    messages: ChatCompletionMessageParam[],
  ): ChatCompletionMessageParam[] {
    return messages.map((message) => {
      if (typeof message.content === 'string') {
        return {
          ...message,
          content: this.sanitizeMessageContent(message.content),
        }
      }
      return message
    })
  }

  /**
   * Extracts content from a chat completion response, handling both regular content and tool calls.
   * Utility function for response processing.
   */
  extractCompletionContent(completion: ChatCompletion): string {
    const message = completion.choices[0]?.message

    if (!message) {
      return ''
    }

    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0]
      return toolCall.function?.arguments || message.content || ''
    }

    return message.content || ''
  }

  /**
   * Internal method to make a chat completion API call.
   * Handles the actual TogetherAI API request with proper configuration.
   */
  private async callChatCompletion({
    model,
    messages,
    temperature,
    topP,
    maxTokens,
    timeout,
    userId,
  }: {
    model: string
    messages: ChatCompletionMessageParam[]
    temperature: number
    topP: number
    maxTokens?: number
    timeout: number
    userId?: string
  }): Promise<LlmCompletionResult> {
    const sanitizedMessages = this.sanitizeMessages(messages)
    const userIdentification = this.prepareUserIdentification(userId)

    const requestParams: Parameters<
      typeof this.client.chat.completions.create
    >[0] = {
      model,
      messages: sanitizedMessages,
      temperature,
      top_p: topP,
      ...(maxTokens && { max_tokens: maxTokens }),
      ...userIdentification,
      stream: false,
    }

    this.logger.debug('Making TogetherAI API request', {
      model,
      baseURL: this.client.baseURL,
      messageCount: sanitizedMessages.length,
      hasUserId: !!userId,
    })

    try {
      const completion = (await this.client.chat.completions.create(
        requestParams,
        {
          timeout,
        },
      )) as ChatCompletion

      const content = this.extractCompletionContent(completion)
      const tokens = completion.usage?.total_tokens || 0

      return {
        content: content.trim(),
        tokens,
      }
    } catch (error) {
      this.logger.error('TogetherAI API request failed', {
        model,
        baseURL: this.client.baseURL,
        error: error instanceof Error ? error.message : String(error),
        status: (error as { status?: number })?.status,
      })
      throw error
    }
  }

  /**
   * Internal method to make a tool completion API call.
   * Handles the actual TogetherAI API request with tool/function calling.
   */
  private async callToolCompletion({
    model,
    messages,
    tools,
    toolChoice,
    temperature,
    topP,
    maxTokens,
    timeout,
    userId,
  }: {
    model: string
    messages: ChatCompletionMessageParam[]
    tools: ChatCompletionTool[]
    toolChoice?: ChatCompletionNamedToolChoice
    temperature: number
    topP: number
    maxTokens?: number
    timeout: number
    userId?: string
  }): Promise<LlmCompletionResult> {
    const sanitizedMessages = this.sanitizeMessages(messages)
    const userIdentification = this.prepareUserIdentification(userId)

    const requestParams: Parameters<
      typeof this.client.chat.completions.create
    >[0] = {
      model,
      messages: sanitizedMessages,
      tools,
      ...(toolChoice && { tool_choice: toolChoice }),
      temperature,
      top_p: topP,
      ...(maxTokens && { max_tokens: maxTokens }),
      ...userIdentification,
      stream: false,
    }

    const completion = (await this.client.chat.completions.create(
      requestParams,
      {
        timeout,
      },
    )) as ChatCompletion

    const content = this.extractCompletionContent(completion)
    const tokens = completion.usage?.total_tokens || 0

    return {
      content: content.trim(),
      tokens,
    }
  }
}
