import { Injectable, Logger } from '@nestjs/common'
import retry from 'async-retry'
import { OpenAI } from 'openai'
import {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
} from 'openai/resources/chat/completions'

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
  toolChoice?: ChatCompletionToolChoiceOption
}

export interface ToolCall {
  id: string
  type: string
  function: {
    name: string
    arguments: string
  }
}

export interface LlmCompletionResult {
  content: string
  tokens: number
  model?: string
  toolCalls?: ToolCall[]
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name)
  private readonly defaultModels: string[]
  private readonly defaultRetries = 3
  private readonly defaultTimeout = 300000
  private readonly client: OpenAI

  constructor() {
    const { TOGETHER_AI_KEY, AI_MODELS = '' } = process.env

    if (!TOGETHER_AI_KEY) {
      throw new Error('Please set TOGETHER_AI_KEY in your .env')
    }
    if (!AI_MODELS) {
      throw new Error('Please set AI_MODELS in your .env')
    }

    this.defaultModels = AI_MODELS.split(',')
      .map((m) => m.trim())
      .filter((m) => m.length > 0)
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
      async (bail) => {
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

            if (this.isPermanentClientError(error)) {
              this.logger.error(
                `Permanent client error for model ${currentModel}, not retrying`,
                lastError,
              )
              bail(lastError)
            }

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
      async (bail) => {
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

            if (this.isPermanentClientError(error)) {
              this.logger.error(
                `Permanent client error for model ${currentModel}, not retrying`,
                lastError,
              )
              bail(lastError)
            }

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
   * Checks if an error is a permanent client error (4xx) that should not be retried.
   * These errors indicate issues with the request itself, not transient failures.
   */
  private isPermanentClientError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const status = (error as { status?: number | string })?.status
      if (typeof status === 'number' && status >= 400 && status < 500) {
        return true
      }
    }
    return false
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
   * Note: Does not replace backticks to preserve Markdown code blocks.
   */
  sanitizeMessageContent(content: string): string {
    let sanitized = content
    sanitized = sanitized.replace(/\–/g, '-')
    return sanitized
  }

  /**
   * Sanitizes an array of messages by cleaning their content.
   * Utility function for message preprocessing.
   * Handles both string content and multimodal array content.
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
      if (Array.isArray(message.content)) {
        return {
          ...message,
          content: message.content.map((part) => {
            if (
              part &&
              typeof part === 'object' &&
              'type' in part &&
              part.type === 'text' &&
              'text' in part &&
              typeof part.text === 'string'
            ) {
              return {
                ...part,
                text: this.sanitizeMessageContent(part.text),
              }
            }
            return part
          }),
        } as ChatCompletionMessageParam
      }
      return message
    })
  }

  /**
   * Extracts content and tool calls from a chat completion response.
   * Returns both content and tool calls separately for unambiguous handling.
   * Utility function for response processing.
   */
  extractCompletionContent(completion: ChatCompletion): {
    content: string
    toolCalls?: ToolCall[]
  } {
    const message = completion.choices[0]?.message

    if (!message) {
      return { content: '' }
    }

    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCalls: ToolCall[] = message.tool_calls.map((toolCall) => ({
        id: toolCall.id,
        type: toolCall.type,
        function: {
          name: toolCall.function?.name || '',
          arguments: toolCall.function?.arguments || '',
        },
      }))
      return {
        content: message.content || '',
        toolCalls,
      }
    }

    return { content: message.content || '' }
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

      const { content, toolCalls } = this.extractCompletionContent(completion)
      const tokens = completion.usage?.total_tokens || 0

      return {
        content: content.trim(),
        tokens,
        ...(toolCalls && { toolCalls }),
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
    toolChoice?: ChatCompletionToolChoiceOption
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

    const { content, toolCalls } = this.extractCompletionContent(completion)
    const tokens = completion.usage?.total_tokens || 0

    return {
      content: content.trim(),
      tokens,
      ...(toolCalls && { toolCalls }),
    }
  }
}
