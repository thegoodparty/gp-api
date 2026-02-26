import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PinoLogger } from 'nestjs-pino'

const prismaErrorClasses = [
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientUnknownRequestError,
  Prisma.PrismaClientRustPanicError,
  Prisma.PrismaClientInitializationError,
  Prisma.PrismaClientValidationError,
]

@Catch(...prismaErrorClasses)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(
    exception: Prisma.PrismaClientKnownRequestError | Error,
    host: ArgumentsHost,
  ) {
    const ctx = host.switchToHttp()
    const response: {
      status: (code: number) => {
        send: (body: Record<string, (() => string) | string | number>) => void
      }
    } = ctx.getResponse()
    const request: { url: string; method: string } = ctx.getRequest()

    let statusCode: HttpStatus | null = null
    let message: string | null = null

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      this.logger.error(
        {
          err: exception,
          meta: exception.meta,
        },
        'Encountered known prisma exception',
      )
      switch (exception.code) {
        case 'P2002': // Unique constraint violation
          statusCode = HttpStatus.CONFLICT
          message = `Duplicate field: ${exception.meta?.target}`
          break
        case 'P2025': // Record not found
          statusCode = HttpStatus.NOT_FOUND
          message = 'Record not found'
          break
        default:
          statusCode = HttpStatus.BAD_REQUEST
          message = exception.message
          break
      }
    } else if (exception instanceof Prisma.PrismaClientRustPanicError) {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR
      message = 'A Prisma internal error occured. Please try again later.'
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      statusCode = HttpStatus.BAD_REQUEST
      message = 'Validation error: ' + exception.message
    } else if (exception instanceof Prisma.PrismaClientUnknownRequestError) {
      statusCode = HttpStatus.BAD_REQUEST
      message = 'An unknown error occured while processing the request.'
    } else if (exception instanceof Prisma.PrismaClientInitializationError) {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR
      message = 'Failed to initialize Prisma Client: ' + exception.message
    }

    if (!statusCode || !message) {
      throw exception
    }

    this.logger.error(
      {
        _arg0: exception.stack || 'No stack trace available',
        ...{
          url: (request as { url: string }).url,
          method: (request as { method: string }).method,
          statusCode,
        },
      },
      `Exception caught: ${message}`,
    )

    const typedResponse = response as {
      status: (code: number) => {
        send: (body: Record<string, (() => string) | string | number>) => void
      }
    }
    typedResponse.status(statusCode).send({
      statusCode,
      timestamp: new Date().toISOString,
      path: (request as { url: string }).url,
      error: message,
    })
  }

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(PrismaExceptionFilter.name)
  }
}
