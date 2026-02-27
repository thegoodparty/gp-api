import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common'
import retry from 'async-retry'
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { LlmService } from 'src/llm/services/llm.service'
import {
  BraintrustService,
  isValidChatRole,
  ValidChatRole,
} from 'src/vendors/braintrust/braintrust.service'
import {
  BiasAnalysisInputSchema,
  BiasAnalysisResponse,
} from '../types/pollBias.types'
import { createPollBiasAnalysisPrompt } from '../utils/pollBiasPrompt.util'
import { convertSubstringsToIndices } from '../utils/pollBiasSpan.util'
import { PinoLogger } from 'nestjs-pino'

@Injectable()
export class PollBiasAnalysisService {
  private readonly maxRetries = 3

  constructor(
    private readonly llmService: LlmService,
    private readonly braintrust: BraintrustService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PollBiasAnalysisService.name)
  }

  /**
   * Analyzes poll text for bias and returns identified bias spans with character positions
   * and a rewritten neutral version of the text.
   * Retries up to maxRetries times if the LLM returns invalid JSON or validation fails.
   * Non-validation errors (network, API failures) are not retried as they're handled by the LLM service.
   */
  async analyzePollText(
    pollText: string,
    userId?: string,
  ): Promise<BiasAnalysisResponse> {
    if (!pollText || pollText.trim().length === 0) {
      throw new BadRequestException('Poll text cannot be empty')
    }

    const messages = await this.getMessagesWithFallback(pollText)

    return retry(
      async (bail): Promise<BiasAnalysisResponse> => {
        try {
          const llmFn = () =>
            this.llmService.jsonCompletion({
              messages,
              schema: BiasAnalysisInputSchema,
              temperature: 0.2,
              maxTokens: 512,
              userId,
              models: [
                'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
                'Qwen/Qwen3-235B-A22B-fp8-tput',
              ],
            })
          const result = await this.braintrust.traced(
            'poll-bias-analysis',
            llmFn,
            {
              input: { pollText, messages },
              metadata: { userId },
            },
          )

          const parsed = this.convertBiasSubstringsToIndices(
            result.object as {
              bias_spans: {
                substring: string
                reason: string
                suggestion?: string
              }[]
              grammar_spans: {
                substring: string
                reason: string
                suggestion?: string
              }[]
              rewritten_text: string
            },
            pollText,
          )

          return parsed
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error)

          if (this.isValidationError(error)) {
            throw error
          }

          this.logger.error(
            {
              error: errorMessage,
            },
            'Error analyzing poll text for bias',
          )
          bail(new BadGatewayException('Failed to analyze poll text for bias'))
          return {
            bias_spans: [],
            grammar_spans: [],
            rewritten_text: '',
          }
        }
      },
      {
        retries: this.maxRetries,
        onRetry: (error, attempt) => {
          this.logger.warn(
            {
              error: error instanceof Error ? error.message : String(error),
              attempt,
              maxRetries: this.maxRetries,
            },
            `Bias analysis attempt ${attempt} failed validation, retrying...`,
          )
        },
      },
    )
  }

  /**
   * Parses and validates the JSON response from the LLM using Zod.
   * Handles cases where the response may contain markdown code blocks or extra text.
   * Converts substring-based bias spans to start/end indices.
   */
  private convertBiasSubstringsToIndices(
    validated: {
      bias_spans: {
        substring: string
        reason: string
        suggestion?: string
      }[]
      grammar_spans: {
        substring: string
        reason: string
        suggestion?: string
      }[]
      rewritten_text: string
    },
    originalText: string,
  ): BiasAnalysisResponse {
    const biasSpans = convertSubstringsToIndices(
      validated.bias_spans,
      originalText,
      [],
      this.logger,
    )

    const grammarSpans = convertSubstringsToIndices(
      validated.grammar_spans,
      originalText,
      biasSpans,
      this.logger,
    )

    return {
      bias_spans: biasSpans,
      grammar_spans: grammarSpans,
      rewritten_text: validated.rewritten_text,
    }
  }

  private async getMessagesWithFallback(
    pollText: string,
  ): Promise<ChatCompletionMessageParam[]> {
    const fallback = createPollBiasAnalysisPrompt(pollText)

    if (!this.braintrust.enabled) {
      return fallback
    }

    const fallbackMessages = fallback
      .filter(
        (msg): msg is ChatCompletionMessageParam & { role: ValidChatRole } =>
          isValidChatRole(msg.role),
      )
      .map((msg) => ({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : '',
      }))

    const messages = await this.braintrust.loadPromptMessages(
      'poll-bias-analysis',
      fallbackMessages,
      { pollText },
    )

    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }))
  }

  private isValidationError(error: unknown): boolean {
    const errorMessage = error instanceof Error ? error.message : String(error)

    return (
      errorMessage.includes('Failed to parse') ||
      errorMessage.includes('Invalid response') ||
      errorMessage.includes('Bias span') ||
      errorMessage.includes('ZodError')
    )
  }
}
