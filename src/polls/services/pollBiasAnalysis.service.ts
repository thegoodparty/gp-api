import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common'
import retry from 'async-retry'
import { LlmService } from 'src/llm/services/llm.service'
import {
  BiasAnalysisInputSchema,
  BiasAnalysisResponse,
  Span,
} from '../types/pollBias.types'
import { createPollBiasAnalysisPrompt } from '../utils/pollBiasPrompt.util'

@Injectable()
export class PollBiasAnalysisService {
  private readonly logger = new Logger(PollBiasAnalysisService.name)
  private readonly maxRetries = 3

  constructor(private readonly llmService: LlmService) {}

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

    const messages = createPollBiasAnalysisPrompt(pollText)

    return retry(
      async (bail) => {
        try {
          const result = await this.llmService.chatCompletion({
            messages,
            temperature: 0.2,
            maxTokens: 512,
            userId,
          })

          const parsed = this.parseAndValidateResponse(result.content, pollText)

          return parsed
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error)

          const isValidationError =
            errorMessage.includes('Failed to parse') ||
            errorMessage.includes('Invalid response') ||
            errorMessage.includes('Bias span') ||
            errorMessage.includes('ZodError')

          if (!isValidationError) {
            this.logger.error('Error analyzing poll text for bias', {
              error: errorMessage,
            })
            bail(
              new BadGatewayException('Failed to analyze poll text for bias'),
            )
          }

          throw error
        }
      },
      {
        retries: this.maxRetries,
        onRetry: (error, attempt) => {
          this.logger.warn(
            `Bias analysis attempt ${attempt} failed validation, retrying...`,
            {
              error: error instanceof Error ? error.message : String(error),
              attempt,
              maxRetries: this.maxRetries,
            },
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
  private parseAndValidateResponse(
    content: string,
    originalText: string,
  ): BiasAnalysisResponse {
    let cleanedContent = content.trim()

    if (cleanedContent.includes('```json')) {
      const jsonMatch = cleanedContent.match(/```json\s*([\s\S]*?)\s*```/)
      if (jsonMatch) {
        cleanedContent = jsonMatch[1].trim()
      }
    } else if (cleanedContent.includes('```')) {
      const codeMatch = cleanedContent.match(/```\s*([\s\S]*?)\s*```/)
      if (codeMatch) {
        cleanedContent = codeMatch[1].trim()
      }
    }

    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(cleanedContent)
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      this.logger.error('Failed to parse JSON from LLM response', {
        content: cleanedContent.substring(0, 500),
        error: errorMessage,
      })
      throw new Error('Failed to parse LLM response as valid JSON')
    }

    const validationResult = BiasAnalysisInputSchema.safeParse(parsedJson)

    if (!validationResult.success) {
      const errorMessages = validationResult.error.errors.map(
        (error) => error.message,
      )
      this.logger.error('LLM response failed Zod validation', {
        errors: validationResult.error.errors,
        content: cleanedContent.substring(0, 500),
      })
      throw new Error(`Invalid response format: ${errorMessages.join(', ')}`)
    }

    const validated = validationResult.data

    const biasSpans = this.convertSubstringsToIndices(
      validated.bias_spans,
      originalText,
    )

    const grammarSpans = this.convertSubstringsToIndices(
      validated.grammar_spans,
      originalText,
      biasSpans,
    )

    return {
      bias_spans: biasSpans,
      grammar_spans: grammarSpans,
      rewritten_text: validated.rewritten_text,
    }
  }

  /**
   * Converts substring-based spans to start/end indices.
   * Finds occurrences of each substring in the original text, handling whitespace variations.
   * Checks for overlaps against previously processed spans (from other types).
   */
  private convertSubstringsToIndices(
    spans: Array<{
      substring: string
      reason: string
      suggestion?: string
    }>,
    originalText: string,
    existingSpans: Span[] = [],
  ): Span[] {
    const result: Span[] = []
    const allUsedSpans: Span[] = [...existingSpans]

    for (const span of spans) {
      const substring = span.substring.trim()

      if (!substring) {
        this.logger.warn('Empty span substring provided', {
          reason: span.reason,
        })
        continue
      }

      let index = originalText.indexOf(substring)

      if (index === -1) {
        const normalizedSubstring = this.normalizeWhitespace(substring)
        const normalizedText = this.normalizeWhitespace(originalText)
        const normalizedIndex = normalizedText.indexOf(normalizedSubstring)

        if (normalizedIndex !== -1) {
          const actualIndex = this.findActualIndex(
            originalText,
            normalizedSubstring,
            normalizedIndex,
          )
          if (actualIndex !== -1) {
            index = actualIndex
          }
        }
      }

      if (index === -1) {
        this.logger.warn(
          `Could not find span substring "${substring}" in original text`,
          {
            substring,
            substringLength: substring.length,
            originalTextLength: originalText.length,
            originalTextPreview: originalText.substring(0, 200),
          },
        )
        continue
      }

      const start = index
      const end = index + substring.length

      if (start < 0 || end > originalText.length) {
        this.logger.warn(
          `Span [${start}, ${end}) is out of bounds for text of length ${originalText.length}`,
          {
            substring,
            start,
            end,
            textLength: originalText.length,
          },
        )
        continue
      }

      if (start >= end) {
        this.logger.warn(
          `Invalid span: start (${start}) must be less than end (${end})`,
          {
            substring,
            start,
            end,
          },
        )
        continue
      }

      const isOverlapping = allUsedSpans.some(
        (usedSpan) => start < usedSpan.end && end > usedSpan.start,
      )

      if (!isOverlapping) {
        const newSpan: Span = {
          start,
          end,
          reason: span.reason,
          suggestion: span.suggestion,
        }
        result.push(newSpan)
        allUsedSpans.push(newSpan)
      } else {
        this.logger.warn(
          `Skipping overlapping span for substring "${substring}"`,
          {
            substring,
            start,
            end,
          },
        )
      }
    }

    return result.sort((a, b) => a.start - b.start)
  }

  /**
   * Normalizes whitespace in text by collapsing multiple spaces/tabs/newlines into single spaces.
   */
  private normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ').trim()
  }

  /**
   * Finds the actual index in the original text given a normalized index.
   * This handles cases where the LLM returns text with different whitespace.
   */
  private findActualIndex(
    originalText: string,
    normalizedSubstring: string,
    normalizedIndex: number,
  ): number {
    let normalizedPos = 0
    let actualPos = 0

    while (normalizedPos < normalizedIndex && actualPos < originalText.length) {
      if (/\s/.test(originalText[actualPos])) {
        actualPos++
        while (
          actualPos < originalText.length &&
          /\s/.test(originalText[actualPos])
        ) {
          actualPos++
        }
        normalizedPos++
      } else {
        actualPos++
        normalizedPos++
      }
    }

    if (normalizedPos === normalizedIndex) {
      const remainingSubstring = normalizedSubstring.substring(1)
      let matchPos = actualPos
      let matchFound = true

      for (let i = 0; i < remainingSubstring.length; i++) {
        const char = remainingSubstring[i]
        if (char === ' ') {
          while (
            matchPos < originalText.length &&
            /\s/.test(originalText[matchPos])
          ) {
            matchPos++
          }
        } else {
          if (
            matchPos >= originalText.length ||
            originalText[matchPos].toLowerCase() !== char.toLowerCase()
          ) {
            matchFound = false
            break
          }
          matchPos++
        }
      }

      if (matchFound) {
        return actualPos
      }
    }

    return -1
  }
}
