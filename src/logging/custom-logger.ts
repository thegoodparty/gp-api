import { LoggerService } from '@nestjs/common'
import { requestContextStore } from './request-context.service'
import jwt, { JwtPayload } from 'jsonwebtoken'
import { FastifyRequest } from 'fastify'

export const determineUser = (req: FastifyRequest): string | undefined => {
  if (!req.headers.authorization) {
    return
  }
  const token = req.headers.authorization.split(' ').at(1)
  if (!token) {
    return
  }
  try {
    const decoded = jwt.verify(token, process.env.AUTH_SECRET!, {
      complete: false,
    }) as JwtPayload

    return (decoded as JwtPayload).sub || undefined
  } catch {
    return
  }
}

const serializeError = (error: Error) => ({
  name: error.name,
  message: error.message,
  stack: error.stack,
})

export class CustomLogger implements LoggerService {
  log(...args: unknown[]): void {
    this.emit('info', args)
  }

  error(...args: unknown[]): void {
    this.emit('error', args)
  }

  warn(...args: unknown[]): void {
    this.emit('warn', args)
  }

  debug(...args: unknown[]): void {
    this.emit('debug', args)
  }

  verbose(...args: unknown[]): void {
    this.emit('verbose', args)
  }

  private emit(level: string, args: unknown[]): void {
    const object: Record<string, unknown> = {
      level: level,
      timestamp: new Date().toISOString(),
    }

    const request = requestContextStore.getStore()
    if (request) {
      object.user = determineUser(request)
      object.requestId = request.id
      object.request = {
        method: request.method,
        url: request.url,
      }
    }

    object.data = args.map((arg) => {
      if (arg instanceof Error) {
        return serializeError(arg)
      }
      for (const errorKey of ['error', 'err', 'e']) {
        if (
          typeof arg === 'object' &&
          arg !== null &&
          errorKey in arg &&
          arg[errorKey] instanceof Error
        ) {
          arg[errorKey] = serializeError(arg[errorKey])
        }
      }

      return arg
    })
    console[level === 'verbose' ? 'debug' : level](JSON.stringify(object))
  }
}
