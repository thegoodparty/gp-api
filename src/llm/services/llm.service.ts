import { Inject, Injectable, Optional } from '@nestjs/common'
import { createAnthropic } from '@ai-sdk/anthropic'
import {
  createOpenAICompatible,
  OpenAICompatibleProvider,
} from '@ai-sdk/openai-compatible'
import {
  stepCountIs,
  streamText as realStreamText,
  tool,
  type LanguageModel,
  type ToolSet,
  type TypedToolCall,
} from 'ai'
import retry from 'async-retry'
import { OpenAI } from 'openai'
import {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
} from 'openai/resources/chat/completions'
import { z } from 'zod'
import { PinoLogger } from 'nestjs-pino'
import { toModelMessages } from './messageConversion'

export { toModelMessages } from './messageConversion'

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
  enableReasoning?: boolean
  reasoningEffort?: 'low' | 'medium' | 'high'
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

export type LlmStreamTool<
  TInput = unknown,
  TOutput = unknown,
> = TInput extends z.ZodTypeAny
  ? {
      description: string
      inputSchema: TInput
      execute: (input: z.infer<TInput>) => Promise<unknown> | unknown
    }
  : {
      description: string
      inputSchema: z.ZodType<TInput>
      execute: (input: TInput) => Promise<TOutput> | TOutput
    }

export interface LlmStreamOptions {
  messages: ChatCompletionMessageParam[]
  tools?: Record<string, LlmStreamTool<z.ZodTypeAny>>
  models?: string[]
  temperature?: number
  topP?: number
  maxOutputTokens?: number
  maxSteps?: number
  userId?: string
  retries?: number
  abortSignal?: AbortSignal
  onToolCallStart?: (event: { name: string; input: unknown }) => void
  onToolCallEnd?: (event: {
    name: string
    input: unknown
    output: unknown
  }) => void
}

export interface LlmStreamUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface LlmStreamResult {
  textStream: AsyncIterable<string>
  finalText: Promise<string>
  toolCalls: Promise<ToolCall[]>
  usage: Promise<LlmStreamUsage>
  model: string
}

export type StreamTextFn = typeof realStreamText

export interface OpenAIClientLike {
  chat: {
    completions: {
      create: (
        body: ChatCompletionCreateParamsNonStreaming,
        options?: { timeout?: number },
      ) => Promise<ChatCompletion>
    }
  }
  baseURL: string
}

export type OpenAIClientFactory = (opts: {
  apiKey: string
  baseURL: string
}) => OpenAIClientLike

export type AiSdkProviderFactory = (opts: {
  apiKey: string
  baseURL: string
}) => OpenAICompatibleProvider

export type AnthropicChatModelResolver = (model: string) => LanguageModel

export type AnthropicProviderFactory = (opts: {
  apiKey: string
}) => AnthropicChatModelResolver

export const STREAM_TEXT_TOKEN = 'LLM_STREAM_TEXT_FN'
export const OPENAI_CLIENT_FACTORY_TOKEN = 'LLM_OPENAI_CLIENT_FACTORY'
export const AI_SDK_PROVIDER_FACTORY_TOKEN = 'LLM_AI_SDK_PROVIDER_FACTORY'
export const ANTHROPIC_PROVIDER_FACTORY_TOKEN = 'LLM_ANTHROPIC_PROVIDER_FACTORY'

export const defaultOpenAIClientFactory: OpenAIClientFactory = ({
  apiKey,
  baseURL,
}) => {
  const openai = new OpenAI({ apiKey, baseURL })
  return {
    chat: {
      completions: {
        create: (body, options) =>
          openai.chat.completions.create(body, options),
      },
    },
    baseURL: openai.baseURL,
  }
}

export const defaultAiSdkProviderFactory: AiSdkProviderFactory = ({
  apiKey,
  baseURL,
}) => createOpenAICompatible({ name: 'together', baseURL, apiKey })

export const defaultAnthropicProviderFactory: AnthropicProviderFactory = ({
  apiKey,
}) => {
  const provider = createAnthropic({ apiKey })
  return (model: string) => provider(model)
}

@Injectable()
export class LlmService {
  private readonly defaultModels: string[]
  private readonly defaultRetries = 3
  private readonly defaultMaxSteps = 5
  private readonly defaultTimeout = 300000
  private readonly client: OpenAIClientLike
  private readonly aiSdkProvider: OpenAICompatibleProvider
  private readonly anthropicProviderFactory: AnthropicProviderFactory
  private readonly anthropicApiKey: string | undefined
  private anthropicResolver?: AnthropicChatModelResolver
  private readonly streamTextFn: StreamTextFn

  constructor(
    private readonly logger: PinoLogger,
    @Optional()
    @Inject(STREAM_TEXT_TOKEN)
    streamTextFn?: StreamTextFn,
    @Optional()
    @Inject(OPENAI_CLIENT_FACTORY_TOKEN)
    openAIClientFactory?: OpenAIClientFactory,
    @Optional()
    @Inject(AI_SDK_PROVIDER_FACTORY_TOKEN)
    aiSdkProviderFactory?: AiSdkProviderFactory,
    @Optional()
    @Inject(ANTHROPIC_PROVIDER_FACTORY_TOKEN)
    anthropicProviderFactory?: AnthropicProviderFactory,
  ) {
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

    const togetherBaseUrl = 'https://api.together.xyz/v1'

    const clientFactory = openAIClientFactory ?? defaultOpenAIClientFactory
    this.client = clientFactory({
      apiKey: TOGETHER_AI_KEY,
      baseURL: togetherBaseUrl,
    })

    const providerFactory = aiSdkProviderFactory ?? defaultAiSdkProviderFactory
    this.aiSdkProvider = providerFactory({
      apiKey: TOGETHER_AI_KEY,
      baseURL: togetherBaseUrl,
    })

    this.anthropicProviderFactory =
      anthropicProviderFactory ?? defaultAnthropicProviderFactory
    this.anthropicApiKey = process.env.ANTHROPIC_API_KEY

    this.streamTextFn = streamTextFn ?? realStreamText
  }

  private resolveChatModel(model: string): LanguageModel {
    if (model.startsWith('claude')) {
      if (!this.anthropicApiKey) {
        throw new Error(
          `ANTHROPIC_API_KEY is not set but model "${model}" requires it`,
        )
      }
      if (!this.anthropicResolver) {
        this.anthropicResolver = this.anthropicProviderFactory({
          apiKey: this.anthropicApiKey,
        })
      }
      return this.anthropicResolver(model)
    }
    return this.aiSdkProvider.chatModel(model)
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
      enableReasoning,
      reasoningEffort,
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
          enableReasoning,
          reasoningEffort,
        }),
    )

    return {
      ...result,
      model,
    }
  }

  /**
   * Streams a chat completion as text deltas, with multi-step tool support.
   *
   * Model fallback applies only at connect-time (synchronous errors from
   * streamText). Once the result object is returned, errors during stream
   * consumption propagate without switching models — you can't restart a
   * partially-shipped response.
   */
  async streamChatCompletion(
    options: LlmStreamOptions,
  ): Promise<LlmStreamResult> {
    const {
      messages,
      tools,
      models: providedModels,
      temperature,
      topP,
      maxOutputTokens,
      maxSteps = this.defaultMaxSteps,
      userId,
      retries = this.defaultRetries,
      abortSignal,
      onToolCallStart,
      onToolCallEnd,
    } = options

    const models = this.prepareModelList(providedModels)
    const toolSet = tools
      ? this.buildToolSet(tools, { onToolCallStart, onToolCallEnd })
      : undefined
    const modelMessages = toModelMessages(messages)

    const { model, result } = await this.withModelFallback(
      models,
      retries,
      'stream chat completion',
      (currentModel) =>
        Promise.resolve(
          this.streamTextFn({
            model: this.resolveChatModel(currentModel),
            messages: modelMessages,
            ...(toolSet && { tools: toolSet }),
            stopWhen: stepCountIs(maxSteps),
            ...(abortSignal && { abortSignal }),
            ...(temperature !== undefined && { temperature }),
            ...(topP !== undefined && { topP }),
            ...(maxOutputTokens !== undefined && { maxOutputTokens }),
            ...(userId && { headers: { 'X-User-Id': userId } }),
          }),
        ),
    )

    return {
      textStream: result.textStream,
      finalText: Promise.resolve(result.text),
      toolCalls: Promise.resolve(result.toolCalls).then((calls) =>
        this.mapAiSdkToolCalls(calls),
      ),
      usage: Promise.resolve(result.totalUsage).then((u) => ({
        inputTokens: u.inputTokens ?? 0,
        outputTokens: u.outputTokens ?? 0,
        totalTokens: u.totalTokens ?? 0,
      })),
      model,
    }
  }

  private buildToolSet(
    tools: Record<string, LlmStreamTool<z.ZodTypeAny>>,
    hooks: {
      onToolCallStart?: (event: { name: string; input: unknown }) => void
      onToolCallEnd?: (event: {
        name: string
        input: unknown
        output: unknown
      }) => void
    } = {},
  ): ToolSet {
    const set: ToolSet = {}
    for (const [name, t] of Object.entries(tools)) {
      set[name] = tool<unknown, unknown>({
        description: t.description,
        inputSchema: t.inputSchema,
        execute: async (input) => {
          hooks.onToolCallStart?.({ name, input })
          try {
            const result = await t.execute(input)
            this.logger.info(
              {
                toolName: name,
                inputPreview: safePreview(toPreviewInput(input)),
              },
              'LLM tool executed',
            )
            hooks.onToolCallEnd?.({ name, input, output: result })
            return result
          } catch (err) {
            this.logger.error(
              {
                err,
                toolName: name,
                inputPreview: safePreview(toPreviewInput(input)),
              },
              'LLM tool execution failed',
            )
            throw err
          }
        },
      })
    }
    return set
  }

  private mapAiSdkToolCalls(calls: TypedToolCall<ToolSet>[]): ToolCall[] {
    return calls.map((c) => ({
      id: c.toolCallId,
      type: 'function',
      function: {
        name: c.toolName,
        arguments: JSON.stringify(c.input),
      },
    }))
  }

  /**
   * Generic helper to run an operation with model fallbacks and retry logic.
   *
   * Permanent client errors (4xx) call `bail()` and return immediately —
   * async-retry rejects the outer promise without scheduling further retries
   * and without cascading to the next model in the list. Transient errors
   * fall through to the next model in this attempt; if all models in the
   * list fail with transient errors, the thrown error triggers async-retry
   * to retry the whole loop.
   */
  private async withModelFallback<R>(
    models: string[],
    retries: number,
    operationLabel: string,
    fn: (model: string) => Promise<R>,
  ): Promise<{ model: string; result: R }> {
    return retry(
      async () => {
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
              // Tag the error so async-retry's onError sees `err.bail === true`
              // and calls `bail()` instead of scheduling a retry. This stops
              // both the cascade to the next model AND the retry loop.
              const bailable: Error & { bail?: boolean } = lastError
              bailable.bail = true
              throw bailable
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
    if (error && typeof error === 'object' && 'status' in error) {
      const status = error.status
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

    const content = normalizeContent(
      'content' in message ? message.content : undefined,
    )

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
   * Shared helper that invokes the OpenAI client's chat.completions.create
   * endpoint and logs failures with model + base URL context before
   * propagating. Used by all three non-streaming completion methods.
   */
  private async createCompletionLogged(
    requestParams: ChatCompletionCreateParamsNonStreaming,
    timeout: number,
    label: string,
  ): Promise<ChatCompletion> {
    try {
      return await this.client.chat.completions.create(requestParams, {
        timeout,
      })
    } catch (error) {
      const status =
        error != null && typeof error === 'object' && 'status' in error
          ? error.status
          : undefined
      this.logger.error(
        {
          model: requestParams.model,
          baseURL: this.client.baseURL,
          error: error instanceof Error ? error.message : String(error),
          status,
        },
        `TogetherAI ${label} request failed`,
      )
      throw error
    }
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

    const requestParams: ChatCompletionCreateParamsNonStreaming = {
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

    const completion = await this.createCompletionLogged(
      requestParams,
      timeout,
      'chat completion',
    )

    const { content, toolCalls } = this.extractCompletionContent(completion)
    const tokens = completion.usage?.total_tokens || 0

    return {
      content: content.trim(),
      tokens,
      ...(toolCalls && { toolCalls }),
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

    const requestParams: ChatCompletionCreateParamsNonStreaming = {
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

    const completion = await this.createCompletionLogged(
      requestParams,
      timeout,
      'json completion',
    )

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
    enableReasoning,
    reasoningEffort,
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
    enableReasoning?: boolean
    reasoningEffort?: 'low' | 'medium' | 'high'
  }): Promise<Omit<LlmCompletionResult, 'model'>> {
    const userIdentification = this.prepareUserIdentification(userId)

    const reasoning = enableReasoning
      ? {
          enabled: true,
          ...(reasoningEffort && { effort: reasoningEffort }),
        }
      : undefined

    // Together AI accepts a non-OpenAI `reasoning` field for reasoning-
    // capable models (e.g. DeepSeek). The OpenAI SDK params type does not
    // model it, so we widen the literal here and the request is forwarded
    // through as JSON.
    const requestParams = {
      model,
      messages,
      tools,
      ...(toolChoice && { tool_choice: toolChoice }),
      temperature,
      top_p: topP,
      ...(maxTokens && { max_tokens: maxTokens }),
      ...(reasoning && { reasoning }),
      ...userIdentification,
      stream: false as const,
    } as ChatCompletionCreateParamsNonStreaming

    const completion = await this.createCompletionLogged(
      requestParams,
      timeout,
      'tool completion',
    )

    const { content, toolCalls } = this.extractCompletionContent(completion)
    const tokens = completion.usage?.total_tokens || 0

    return {
      content: content.trim(),
      tokens,
      ...(toolCalls && { toolCalls }),
    }
  }
}

type PreviewInput = string | number | boolean | bigint | object | null

const toPreviewInput = (value: unknown): PreviewInput => {
  if (value === undefined) return null
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'object'
  ) {
    return value
  }
  return String(value)
}

const safePreview = (input: PreviewInput): string => {
  try {
    const replacer = (_key: string, value: unknown): unknown =>
      typeof value === 'bigint' ? value.toString() : value
    const str = JSON.stringify(input, replacer)
    if (str === undefined) {
      return '[unstringifiable]'
    }
    return str.slice(0, 500)
  } catch {
    return '[unstringifiable]'
  }
}
