import { ArgumentsHost, Catch, HttpException } from '@nestjs/common'
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core'
import { PinoLogger } from 'nestjs-pino'

@Catch()
export class HttpExceptionFilter extends BaseExceptionFilter {
  constructor(
    private readonly logger: PinoLogger,
    httpAdapterHost: HttpAdapterHost,
  ) {
    super(httpAdapterHost.httpAdapter)
    this.logger.setContext(HttpExceptionFilter.name)
  }

  catch(exception: Error, host: ArgumentsHost) {
    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : 500

    this.logger.error({ statusCode, err: exception }, 'Exception detected')

    super.catch(exception, host)
  }
}
