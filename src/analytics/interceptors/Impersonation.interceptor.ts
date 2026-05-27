import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'

import { Observable } from 'rxjs'
import { runWithImpersonation } from '../impersonation-context'

@Injectable()
export class ImpersonationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      user?: { impersonating?: boolean }
      actorSub?: string
    }>()
    const isImpersonating =
      request.user?.impersonating === true || request.actorSub != null

    return new Observable((subscriber) => {
      let inner: ReturnType<Observable<unknown>['subscribe']> | undefined
      runWithImpersonation(isImpersonating, () => {
        inner = next.handle().subscribe(subscriber)
      })
      return () => inner?.unsubscribe()
    })
  }
}
