import {
  Logger,
  BadGatewayException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common'
import { ServiceException } from '@smithy/smithy-client'

/**
 * Base class for AWS services that provides common error handling and functionality
 * Extend this class to create specific AWS service implementations
 */
export abstract class AwsService {
  protected readonly logger = new Logger(this.constructor.name)

  /**
   * Handles AWS SDK errors by mapping them to appropriate HTTP exceptions
   * - User input errors (400s) -> BadRequestException
   * - Auth errors (401/403s) -> UnauthorizedException/ForbiddenException
   * - AWS service errors (500s) -> BadGatewayException
   * @param error - The AWS error to handle
   * @param context - Additional context about where the error occurred (e.g. service name and operation)
   */
  private handleAwsError(error: unknown, context: string): never {
    this.logger.debug(`AWS error in ${context}:`, error)

    if (error instanceof ServiceException) {
      // Handle user input validation errors (400s)
      switch (error.name) {
        case 'InvalidInput':
        case 'InvalidParameter':
        case 'InvalidParameterValue':
        case 'ValidationError':
        case 'InvalidRequest':
        case 'MalformedQueryString':
        case 'MissingParameter':
        case 'InvalidArgument':
          throw new BadRequestException(error.message)

        // Handle authentication errors (401s)
        case 'AccessDeniedException':
        case 'NotAuthorized':
        case 'InvalidSignatureException':
        case 'SignatureDoesNotMatch':
        case 'ExpiredTokenException':
        case 'InvalidToken':
          throw new UnauthorizedException(error.message)

        // Handle authorization errors (403s)
        case 'OptInRequired':
        case 'InsufficientPermissions':
        case 'AccountProblem':
          throw new ForbiddenException(error.message)

        // All other AWS errors (500s) are treated as gateway errors
        default:
          throw new BadGatewayException('Error communicating with AWS service')
      }
    }

    // If it's not an AWS error, rethrow it
    throw error
  }

  /**
   * Wraps an AWS service call with error handling
   * @param operation - The AWS operation to execute
   * @param context - Context for error logging (e.g. method name)
   */
  protected async executeAwsOperation<T>(
    operation: () => Promise<T>,
    context: string,
  ): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      // If this is an AWS SDK v3 error, handle it
      if (error instanceof ServiceException) {
        this.handleAwsError(error, context)
      }

      // If it's not an AWS error, rethrow it
      throw error
    }
  }
}
