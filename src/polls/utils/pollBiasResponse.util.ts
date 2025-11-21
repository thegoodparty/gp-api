import { Logger } from '@nestjs/common'
import {
  BiasAnalysisInput,
  BiasAnalysisInputSchema,
} from '../types/pollBias.types'

/**
 * Cleans LLM response content by removing markdown code blocks.
 */
export function cleanJsonContent(content: string): string {
  let cleaned = content.trim()

  if (cleaned.includes('```json')) {
    const jsonMatch = cleaned.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      cleaned = jsonMatch[1].trim()
    }
  } else if (cleaned.includes('```')) {
    const codeMatch = cleaned.match(/```\s*([\s\S]*?)\s*```/)
    if (codeMatch) {
      cleaned = codeMatch[1].trim()
    }
  }

  return cleaned
}

/**
 * Parses JSON from string, handling parse errors gracefully.
 */
export function parseJson(content: string, logger: Logger): unknown {
  try {
    return JSON.parse(content)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('Failed to parse JSON from LLM response', {
      content: content.substring(0, 500),
      error: errorMessage,
    })
    throw new Error('Failed to parse LLM response as valid JSON')
  }
}

/**
 * Validates parsed JSON against the BiasAnalysisInput schema.
 */
export function validateBiasAnalysisInput(
  parsedJson: unknown,
  logger: Logger,
): BiasAnalysisInput {
  const validationResult = BiasAnalysisInputSchema.safeParse(parsedJson)

  if (!validationResult.success) {
    const errorMessages = validationResult.error.errors.map(
      (error) => error.message,
    )
    logger.error('LLM response failed Zod validation', {
      errors: validationResult.error.errors,
      content:
        typeof parsedJson === 'string'
          ? parsedJson.substring(0, 500)
          : JSON.stringify(parsedJson).substring(0, 500),
    })
    throw new Error(`Invalid response format: ${errorMessages.join(', ')}`)
  }

  return validationResult.data as BiasAnalysisInput
}

/**
 * Checks if an error is a validation error that should be retried.
 */
export function isValidationError(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error)

  return (
    errorMessage.includes('Failed to parse') ||
    errorMessage.includes('Invalid response') ||
    errorMessage.includes('Bias span') ||
    errorMessage.includes('ZodError')
  )
}
