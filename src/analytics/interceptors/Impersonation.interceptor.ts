import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Observable, Subscription } from 'rxjs'
import { runWithImpersonation } from '@/analytics/impersonation-context'
import { IncomingRequest } from '@/authentication/authentication.types'

@Injectable()
export class ImpersonationInterceptor implements NestInterceptor {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<IncomingRequest>()
    const isImpersonating = request.user?.impersonating === true

    return new Observable((subscriber) => {
      let inner: Subscription | undefined
      runWithImpersonation(isImpersonating, () => {
        inner = next.handle().subscribe(subscriber)
      })
      return () => inner?.unsubscribe()
    })
  }
}
