import { Injectable } from '@nestjs/common'
import retry from 'async-retry'
import { OpenAI } from 'openai'
import {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
} from 'openai/resources/chat/completions'
import { z } from 'zod'
import { PinoLogger } from 'nestjs-pino'

export interface LlmChatCompletionOptions {
  messages: ChatCompletionMessageParam[]
  models?: string[]
  temperature?: number
  topP?: number
  maxTokens?: number
  timeout?: number
  userId?: string
  retries?: number
}

export interface LlmToolCompletionOptions extends LlmChatCompletionOptions {
  tools: ChatCompletionTool[]
  toolChoice?: ChatCompletionToolChoiceOption
}

export interface LlmJsonCompletionOptions<T> extends LlmChatCompletionOptions {
  schema: z.ZodType<T>
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
  model: string
  toolCalls?: ToolCall[]
}

@Injectable()
export class LlmService {
  private readonly defaultModels: string[]
  private readonly defaultRetries = 3
  private readonly defaultTimeout = 300000
  private readonly client: OpenAI

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(LlmService.name)
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
      models: providedModels,
      temperature = 0.7,
      topP = 1.0,
      maxTokens,
      timeout = this.defaultTimeout,
      userId,
      retries = this.defaultRetries,
    } = options

    const models = this.prepareModelList(providedModels)

    const { model, result } = await this.withModelFallback(
      models,
      retries,
      'chat completion',
      (currentModel) =>
        this.callChatCompletion({
          model: currentModel,
          messages,
          temperature,
          topP,
          maxTokens,
          timeout,
          userId,
        }),
    )

    return {
      ...result,
      model,
    }
  }

  /**
   * Creates a JSON-mode completion validated against a Zod schema.
   */
  async jsonCompletion<T>(
    options: LlmJsonCompletionOptions<T>,
  ): Promise<{ object: T; tokens: number; model: string }> {
    const {
      messages,
      schema,
      models: providedModels,
      temperature = 0,
      topP = 1,
      maxTokens,
      timeout = this.defaultTimeout,
      userId,
      retries = this.defaultRetries,
    } = options

    const models = this.prepareModelList(providedModels)

    const { model, result } = await this.withModelFallback(
      models,
      retries,
      'json completion',
      (currentModel) =>
        this.callJsonCompletion({
          model: currentModel,
          messages,
          schema,
          temperature,
          topP,
          maxTokens,
          timeout,
          userId,
        }),
    )

    return {
      object: result.object,
      tokens: result.tokens,
      model,
    }
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
      models: providedModels,
      temperature = 0.1,
      topP = 0.1,
      maxTokens,
      timeout = this.defaultTimeout,
      userId,
      retries = this.defaultRetries,
    } = options

    if (!tools.length) {
      throw new Error('Tools must be provided for tool completion')
    }

    const models = this.prepareModelList(providedModels)

    const { model, result } = await this.withModelFallback(
      models,
      retries,
      'tool completion',
      (currentModel) =>
        this.callToolCompletion({
          model: currentModel,
          messages,
          tools,
          toolChoice,
          temperature,
          topP,
          maxTokens,
          timeout,
          userId,
        }),
    )

    return {
      ...result,
      model,
    }
  }

  /**
   * Generic helper to run an operation with model fallbacks and retry logic.
   */
  private async withModelFallback<R>(
    models: string[],
    retries: number,
    operationLabel: string,
    fn: (model: string) => Promise<R>,
  ): Promise<{ model: string; result: R }> {
    return retry(
      async (bail) => {
        let lastError: Error | undefined

        for (let i = 0; i < models.length; i++) {
          const currentModel = models[i]

          try {
            const result = await fn(currentModel)
            return { model: currentModel, result }
          } catch (error) {
            lastError =
              error instanceof Error ? error : new Error(String(error))

            if (this.isPermanentClientError(error)) {
              this.logger.error(
                lastError,
                `Permanent client error for ${operationLabel} with model ${currentModel}, not retrying`,
              )
              bail(lastError)
            }

            this.logger.warn(
              lastError,
              `Model ${currentModel} failed for ${operationLabel}, ${
                i < models.length - 1 ? 'trying fallback' : 'no more fallbacks'
              }`,
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
            { error },
            `${operationLabel} attempt ${attempt} failed, retrying...`,
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
   * Prepares a list of models for fallback, using the provided models or default models.
   */
  private prepareModelList(models?: string[]): string[] {
    return models && models.length > 0 ? models : this.defaultModels
  }

  /**
   * Prepares user identification for token caching.
   * TogetherAI API uses this to cache usage and avoid duplicate token charges.
   */
  private prepareUserIdentification(userId?: string): { user?: string } {
    return userId ? { user: userId } : {}
  }

  /**
   * Extracts content and tool calls from a chat completion response.
   * Handles both string and array content.
   */
  private extractCompletionContent(completion: ChatCompletion): {
    content: string
    toolCalls?: ToolCall[]
  } {
    const message = completion.choices[0]?.message

    if (!message) {
      return { content: '' }
    }

    const normalizeContent = (c: unknown): string => {
      if (typeof c === 'string') {
        return c
      }

      if (Array.isArray(c)) {
        return c
          .map((part: { type?: string; text?: string }) => {
            if (part.type === 'text' && typeof part.text === 'string') {
              return part.text
            }
            return ''
          })
          .join('')
      }

      return ''
    }

    const content = normalizeContent((message as { content: unknown }).content)

    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCalls: ToolCall[] = message.tool_calls.map(
        (toolCall: {
          id: string
          type: string
          function: { name?: string; arguments?: string }
        }) => ({
          id: toolCall.id,
          type: toolCall.type,
          function: {
            name: toolCall.function?.name || '',
            arguments: toolCall.function?.arguments || '',
          },
        }),
      )

      return {
        content,
        toolCalls,
      }
    }

    return { content }
  }

  /**
   * Internal method to make a chat completion API call.
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
  }): Promise<Omit<LlmCompletionResult, 'model'>> {
    const userIdentification = this.prepareUserIdentification(userId)

    const requestParams: Parameters<
      (typeof this.client.chat.completions)['create']
    >[0] = {
      model,
      messages,
      temperature,
      top_p: topP,
      ...(maxTokens && { max_tokens: maxTokens }),
      ...userIdentification,
      stream: false,
    }

    this.logger.debug(
      {
        model,
        baseURL: this.client.baseURL,
        messageCount: messages.length,
        hasUserId: !!userId,
      },
      'Making TogetherAI API request',
    )

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
      this.logger.error(
        {
          model,
          baseURL: this.client.baseURL,
          error: error instanceof Error ? error.message : String(error),
          status: (error as { status?: number })?.status,
        },
        'TogetherAI API request failed',
      )
      throw error
    }
  }

  /**
   * Internal method to make a JSON-mode completion API call.
   */
  private async callJsonCompletion<T>({
    model,
    messages,
    schema,
    temperature,
    topP,
    maxTokens,
    timeout,
    userId,
  }: {
    model: string
    messages: ChatCompletionMessageParam[]
    schema: z.ZodType<T>
    temperature: number
    topP: number
    maxTokens?: number
    timeout: number
    userId?: string
  }): Promise<{ object: T; tokens: number }> {
    const userIdentification = this.prepareUserIdentification(userId)

    const requestParams: Parameters<
      (typeof this.client.chat.completions)['create']
    >[0] = {
      model,
      messages,
      temperature,
      top_p: topP,
      ...(maxTokens && { max_tokens: maxTokens }),
      ...userIdentification,
      stream: false,
      response_format: { type: 'json_object' },
    }

    this.logger.debug(
      {
        model,
        baseURL: this.client.baseURL,
        messageCount: messages.length,
        hasUserId: !!userId,
      },
      'Making TogetherAI JSON-mode API request',
    )

    const completion = (await this.client.chat.completions.create(
      requestParams,
      {
        timeout,
      },
    )) as ChatCompletion
    const { content } = this.extractCompletionContent(completion)
    const tokens = completion.usage?.total_tokens || 0

    const cleanJson = (raw: string): string => {
      let cleaned = raw.trim()
      cleaned = cleaned
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/, '')
        .trim()
      cleaned = cleaned.replace(/,\s*([}\]])/g, '$1')
      return cleaned
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(cleanJson(content))
    } catch (err) {
      this.logger.error(
        {
          model,
          contentPreview: content.slice(0, 200),
          error: err instanceof Error ? err.message : String(err),
        },
        'Invalid JSON from model',
      )
      throw new Error(`Model returned invalid JSON for ${model}`)
    }

    const object = schema.parse(parsed)

    return {
      object,
      tokens,
    }
  }

  /**
   * Internal method to make a tool completion API call.
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
  }): Promise<Omit<LlmCompletionResult, 'model'>> {
    const userIdentification = this.prepareUserIdentification(userId)

    const requestParams: Parameters<
      (typeof this.client.chat.completions)['create']
    >[0] = {
      model,
      messages,
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
