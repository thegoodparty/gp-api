import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { User } from '@prisma/client'
import { FastifyRequest } from 'fastify'
import { Observable, catchError, throwError } from 'rxjs'
import {
  addCustomAttributes,
  recordCustomEvent,
} from '@/observability/newrelic/newrelic.client'
import { CustomEventType } from '@/observability/newrelic/newrelic.events'
import { deriveRootCause, shouldRecordBlockedState } from './blockedState.rules'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function safeErrorMessage(err: unknown): string {
  if (err instanceof HttpException) {
    const response = err.getResponse()
    if (typeof response === 'string') return response
    if (isRecord(response) && 'message' in response) {
      const msg = response.message
      if (typeof msg === 'string') return msg
      if (Array.isArray(msg)) return msg.join(', ')
    }
    return err.message
  }
  if (err instanceof Error) return err.message
  return String(err)
}

function safeStatusCode(err: unknown): number {
  if (err instanceof HttpException) return err.getStatus()
  return 500
}

function safeErrorCode(err: unknown): string | number | null {
  if (err instanceof HttpException) {
    const response = err.getResponse()
    if (isRecord(response) && 'errorCode' in response) {
      const code = response.errorCode
      if (typeof code === 'string' || typeof code === 'number') return code
    }
  }

  if (!isRecord(err)) return null

  if (typeof err.code === 'string' || typeof err.code === 'number') {
    return err.code
  }

  // Common pattern: { cause: { code } }
  const cause = err.cause
  if (
    isRecord(cause) &&
    (typeof cause.code === 'string' || typeof cause.code === 'number')
  ) {
    return cause.code
  }

  return null
}

type RouteInfoFastifyRequest = FastifyRequest & {
  routerPath?: string
  routeOptions?: { url?: string }
}

function safeEndpoint(
  request: RouteInfoFastifyRequest,
  context: ExecutionContext,
): string {
  // Nest/Fastify doesn’t always expose a stable “route template” value.
  // Prefer it if present, fall back to the raw URL.
  const routerPath = request.routerPath
  if (typeof routerPath === 'string' && routerPath.length > 0) return routerPath

  const url = request.routeOptions?.url
  if (typeof url === 'string' && url.length > 0) return url

  // Try to at least facet by controller/handler if URL is too noisy.
  const handlerName = context.getHandler()?.name
  const className = context.getClass()?.name
  if (className && handlerName) return `${className}.${handlerName}`

  return request.url || 'unknown'
}

@Injectable()
export class BlockedStateInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<RouteInfoFastifyRequest & { user?: User }>()

    const userId = request.user?.id ?? null
    const method = request.method
    const endpoint = safeEndpoint(request, context)

    // Denominator support: attach userId to the transaction when authenticated.
    if (userId !== null) {
      addCustomAttributes({ userId, endpoint, method })
    }

    return next.handle().pipe(
      catchError((err: unknown) => {
        if (userId === null) {
          return throwError(() => err)
        }

        const statusCode = safeStatusCode(err)
        const errorMessage = safeErrorMessage(err)
        const errorCode = safeErrorCode(err)

        if (
          !shouldRecordBlockedState({ statusCode, errorMessage, errorCode })
        ) {
          return throwError(() => err)
        }

        const errorClass = err instanceof Error ? err.name : 'UnknownError'

        const rootCause = deriveRootCause({
          errorMessage,
          statusCode,
          errorCode,
        })

        recordCustomEvent(CustomEventType.BlockedState, {
          service: 'gp-api',
          environment: process.env.NODE_ENV,
          userId,
          endpoint,
          method,
          statusCode,
          errorClass,
          errorMessage,
          ...(errorCode !== null && errorCode !== undefined
            ? { errorCode }
            : {}),
          rootCause,
          isBackground: false,
        })

        return throwError(() => err)
      }),
    )
  }
}
