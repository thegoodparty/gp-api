import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Catch()
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': // Unique constraint violation
          statusCode = HttpStatus.CONFLICT;
          message = `Duplicate field: ${exception.meta?.target}`;
          break;
        case 'P2025': // Record not found
          statusCode = HttpStatus.NOT_FOUND;
          message = 'Record not found';
          break;
        default:
          statusCode = HttpStatus.BAD_REQUEST;
          message = exception.message;
          break;
      }
    } else if (exception instanceof Prisma.PrismaClientRustPanicError) {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'A Prisma internal error occured. Please try again later.';

    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      statusCode = HttpStatus.BAD_REQUEST;
      message = 'Validation error: ' + exception.message;

    } else if (exception instanceof Prisma.PrismaClientUnknownRequestError) {
      statusCode = HttpStatus.BAD_REQUEST;
      message = 'An unknown error occured while processing the request.';

    } else if (exception instanceof Prisma.PrismaClientInitializationError) {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Failed to intialize Prisma Client: ' + exception.message;

    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const responseMessage = exception.getResponse();

      message =
        typeof responseMessage === 'string'
        ? responseMessage
        : (responseMessage as any).message || JSON.stringify(responseMessage);
    }

    this.logger.error(
      `Exception caught: ${message}`,
      exception.stack || 'No stack trace available',
      {
        url: request.url,
        method: request.method,
        statusCode,
      },
    );

    response.status(statusCode).json({
      statusCode,
      timestamp: new Date().toISOString,
      path: request.url,
      error: message,
    });
  }
}