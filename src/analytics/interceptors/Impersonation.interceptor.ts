import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { FastifyRequest } from 'fastify'
import { Observable } from 'rxjs'
import { runWithImpersonation } from '../impersonation-context'

@Injectable()
export class ImpersonationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: { impersonating?: boolean } }>()
    const isImpersonating = request.user?.impersonating === true

    return new Observable((subscriber) => {
      const subscription = runWithImpersonation(isImpersonating, () =>
        next.handle().subscribe(subscriber),
      )
      return () => {
        subscription.unsubscribe()
      }
    })
  }
}
