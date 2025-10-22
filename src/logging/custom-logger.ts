import { LoggerService } from '@nestjs/common'
import { requestContextStore } from './request-context.service'
import jwt, { JwtPayload } from 'jsonwebtoken'
import { FastifyRequest } from 'fastify'
import { prettyFactory } from 'pino-pretty'

const prettify =
  process.env.NODE_ENV !== 'production'
    ? prettyFactory({ colorize: true })
    : undefined

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

    // If there are multiple arguments and the last one is a string, it's the context string.
    if (args.length > 1 && typeof args[args.length - 1] === 'string') {
      object.context = args[args.length - 1]
      args.pop()
    }
    // We want to retain all of the data from variadic arguments. So, reduce them all down into
    // a single object.
    for (const arg of args) {
      if (typeof arg === 'string') {
        object.msg = arg
      } else if (arg instanceof Error) {
        object.error = {
          name: arg.name,
          message: arg.message,
          stack: arg.stack,
        }
      } else if (typeof arg === 'object') {
        Object.assign(object, arg)
      }
    }
    const message = prettify ? prettify(object) : JSON.stringify(object)
    console[level](message)
  }
}
