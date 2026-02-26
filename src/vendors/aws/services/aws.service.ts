import {
  BadGatewayException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common'
import { ServiceException } from '@smithy/smithy-client'
import { PinoLogger } from 'nestjs-pino'

/**
 * Base class for AWS services that provides common error handling and functionality
 * Extend this class to create specific AWS service implementations
 */
export abstract class AwsService {
  /**
   * Handles AWS SDK errors by mapping them to appropriate HTTP exceptions
   * - User input errors (400s) -> BadRequestException
   * - Auth errors (401/403s) -> UnauthorizedException/ForbiddenException
   * - AWS service errors (500s) -> BadGatewayException
   * @param error - The AWS error to handle
   * @param message - Optional message to add to the error log
   */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  private handleAwsError(error: unknown, message?: string): never {
    this.logger.debug({ error }, `AWS error: ${message}`)

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
   * @param message - Optional message to add to the error log
   */
  protected async executeAwsOperation<T>(
    operation: () => Promise<T>,
    message?: string,
  ): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      // If this is an AWS SDK v3 error, handle it
      if (error instanceof ServiceException) {
        this.handleAwsError(error, message)
      }

      // If it's not an AWS error, rethrow it
      throw error
    }
  }

  constructor(protected readonly logger: PinoLogger) {
    this.logger.setContext(this.constructor.name)
  }
}
