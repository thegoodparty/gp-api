import { Route53DomainsServiceException } from '@aws-sdk/client-route-53-domains'
import {
  UnauthorizedException,
  ForbiddenException,
  InternalServerErrorException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common'

const logger = new Logger('AwsErrorUtil')

/**
 * Normalizes common AWS errors into appropriate HTTP exceptions
 * This is a catchall for common AWS errors and should be moved to a utility function
 * @param error - The AWS error to normalize
 * @param context - Additional context about where the error occurred
 */
export function handleAwsError(error: unknown, context: string): never {
  logger.debug(`AWS Route53 error in ${context}:`, error)

  if (error instanceof Route53DomainsServiceException) {
    // Handle common AWS errors
    switch (error.name) {
      // Common AWS errors (401/403)
      case 'AccessDeniedException':
      case 'NotAuthorized':
        throw new UnauthorizedException(error.message)

      case 'OptInRequired':
        throw new ForbiddenException(error.message)

      // Common AWS errors (500)
      case 'InternalFailure':
        throw new InternalServerErrorException(error.message)

      // Common AWS errors (503)
      case 'ServiceUnavailable':
        throw new ServiceUnavailableException(error.message)

      // For any other AWS errors, throw a generic service unavailable
      default:
        logger.warn(`Unhandled AWS error type: ${error.name}`, error)
        throw new ServiceUnavailableException(
          `AWS Route53 service error: ${error.message}`,
        )
    }
  }

  // For non-AWS errors, throw a generic service unavailable
  logger.error(`Unexpected non-AWS error in ${context}:`, error)
  throw new ServiceUnavailableException(
    `Unexpected error in AWS Route53 service: ${error instanceof Error ? error.message : 'Unknown error'}`,
  )
}
