import {
  CallHandler,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Observable, map } from 'rxjs'
import { ZodSchema } from 'zod'
import { RESPONSE_SCHEMA_KEY } from '../decorators/ResponseSchema.decorator'

@Injectable()
export class ZodResponseInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ZodResponseInterceptor.name)

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const schema = this.reflector.get<ZodSchema | undefined>(
      RESPONSE_SCHEMA_KEY,
      context.getHandler(),
    )

    if (!schema) {
      return next.handle()
    }

    return next.handle().pipe(
      map((data) => {
        const result = schema.safeParse(data)
        if (!result.success) {
          this.logger.error(
            'Response validation failed:',
            result.error.flatten(),
          )
          throw new InternalServerErrorException('Response validation failed')
        }
        return result.data
      }),
    )
  }
}
