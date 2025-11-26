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
