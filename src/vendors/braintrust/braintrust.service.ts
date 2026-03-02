import { Injectable } from '@nestjs/common'
import * as braintrust from 'braintrust'
import { CURRENT_ENVIRONMENT } from 'src/shared/util/appEnvironment.util'
import { PinoLogger } from 'nestjs-pino'

export const VALID_CHAT_ROLES = ['system', 'user', 'assistant'] as const
export type ValidChatRole = (typeof VALID_CHAT_ROLES)[number]

export const isValidChatRole = (role: string): role is ValidChatRole =>
  VALID_CHAT_ROLES.includes(role as ValidChatRole)

class LlmExecutionError extends Error {
  constructor(public readonly cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause))
  }
}

@Injectable()
export class BraintrustService {
  private readonly projectName = 'gp-api'
  private braintrustLogger: braintrust.Logger<boolean> | null = null
  private _enabled: boolean = false

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(BraintrustService.name)
    const braintrustApiKey = process.env.BRAINTRUST_API_KEY
    if (!braintrustApiKey) {
      this.logger.warn(
        'BRAINTRUST_API_KEY not set - Braintrust tracing disabled',
      )
      return
    }

    try {
      this.braintrustLogger = braintrust.initLogger({
        projectName: this.projectName,
        apiKey: braintrustApiKey,
      })
      this._enabled = true
      this.logger.info('Braintrust tracing enabled')
    } catch (error) {
      this.logger.error(
        { data: error instanceof Error ? error.stack : String(error) },
        'Failed to initialize Braintrust',
      )
    }
  }

  get enabled(): boolean {
    return this._enabled
  }

  async traced<T>(
    name: string,
    llmFn: () => T | Promise<T>,
    options?: {
      input?: Record<string, unknown>
      metadata?: Record<string, unknown>
    },
  ): Promise<T> {
    if (!this._enabled || !this.braintrustLogger) {
      return llmFn()
    }

    let llmResult: T | undefined
    let llmExecuted = false

    try {
      return await this.braintrustLogger.traced(
        async (span) => {
          try {
            llmResult = await llmFn()
            llmExecuted = true
            this.logToSpan(span, options, this.serializeOutput(llmResult))
            return llmResult
          } catch (error) {
            this.logToSpan(span, options, {
              error: error instanceof Error ? error.message : String(error),
              success: false,
            })
            // Wrap the error to distinguish it from a tracing error
            throw new LlmExecutionError(error)
          }
        },
        { name },
      )
    } catch (error) {
      if (error instanceof LlmExecutionError) {
        throw error.cause
      }
      this.logger.warn(
        `Braintrust tracing failed for "${name}": ${error instanceof Error ? error.message : String(error)}`,
      )

      if (llmExecuted) {
        return llmResult as T
      }

      // Fallback: execute without tracing if tracing system fails
      return llmFn()
    }
  }

  private logToSpan(
    span: { log: (data: Record<string, unknown>) => void },
    options:
      | { input?: Record<string, unknown>; metadata?: Record<string, unknown> }
      | undefined,
    output: Record<string, unknown>,
  ): void {
    try {
      span.log({
        input: options?.input,
        output,
        metadata: { environment: CURRENT_ENVIRONMENT, ...options?.metadata },
      })
    } catch (err) {
      this.logger.warn(
        `Failed to log to Braintrust span: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  async loadPromptMessages(
    promptName: string,
    fallbackMessages: Array<{
      role: 'system' | 'user' | 'assistant'
      content: string
    }>,
    variables?: Record<string, string>,
  ): Promise<
    Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  > {
    if (this._enabled) {
      try {
        const braintrustMessages = await this.fetchBraintrustPrompt(
          promptName,
          variables,
        )
        if (braintrustMessages) {
          return braintrustMessages
        }
      } catch (error) {
        this.logger.warn(
          `Failed to load prompt "${promptName}" from Braintrust, using fallback: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    return this.renderMessages(fallbackMessages, variables)
  }

  private async fetchBraintrustPrompt(
    promptName: string,
    variables?: Record<string, string>,
  ): Promise<Array<{ role: ValidChatRole; content: string }> | null> {
    const prompt = await braintrust.loadPrompt({
      projectName: this.projectName,
      slug: promptName,
    })

    if (!prompt) {
      this.logger.debug(
        `Prompt "${promptName}" not found in Braintrust, using fallback`,
      )
      return null
    }

    const params = prompt.build(variables || {})
    if (!params.messages || !Array.isArray(params.messages)) {
      return null
    }

    const validMessages: Array<{ role: ValidChatRole; content: string }> = []

    for (const msg of params.messages) {
      const role = msg.role || 'user'
      if (!isValidChatRole(role)) {
        this.logger.warn(
          `Invalid role "${role}" in Braintrust prompt "${promptName}", skipping message`,
        )
        continue
      }
      validMessages.push({
        role: role as ValidChatRole,
        content: this.extractContent(msg.content),
      })
    }

    if (validMessages.length === 0) {
      this.logger.warn(
        `No valid messages in Braintrust prompt "${promptName}", using fallback`,
      )
      return null
    }

    return validMessages
  }

  private renderMessages(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    variables?: Record<string, string>,
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    if (!variables) {
      return messages
    }

    return messages.map((msg) => ({
      role: msg.role,
      content: this.renderPrompt(msg.content, variables),
    }))
  }

  private renderPrompt(
    prompt: string,
    variables?: Record<string, string>,
  ): string {
    if (!variables) {
      return prompt
    }

    return Object.entries(variables).reduce((rendered, [key, value]) => {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const escapedValue = value.replace(/\$/g, '$$$$') // Escape replacement pattern chars
      return rendered.replace(
        new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'g'),
        escapedValue,
      )
    }, prompt)
  }

  private extractContent(content: unknown): string {
    if (typeof content === 'string') {
      return content
    }

    if (Array.isArray(content)) {
      return content
        .map((block) => {
          if (typeof block === 'string') return block
          if (block && typeof block === 'object') {
            if ('text' in block) return String(block.text)
            if ('content' in block) return String(block.content)
          }
          return ''
        })
        .join('')
    }

    return String(content || '')
  }

  private serializeOutput(result: unknown): Record<string, unknown> {
    if (result === null || result === undefined) {
      return { result: null }
    }

    if (
      typeof result === 'object' &&
      'toJSON' in result &&
      typeof (result as { toJSON: unknown }).toJSON === 'function'
    ) {
      return (result as { toJSON: () => Record<string, unknown> }).toJSON()
    }

    if (typeof result === 'object' && !Array.isArray(result)) {
      return result as Record<string, unknown>
    }

    if (Array.isArray(result)) {
      return { result }
    }

    return { result: String(result) }
  }
}
