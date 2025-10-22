import { Injectable, LoggerService, Scope } from '@nestjs/common'
import {
  Logger as WinstonLogger,
  createLogger,
  format,
  transports,
} from 'winston'
import { RequestContextService } from './request-context.service'

@Injectable({ scope: Scope.TRANSIENT })
export class CustomWinstonLogger implements LoggerService {
  private logger: WinstonLogger
  private context?: string

  constructor(private readonly requestContextService: RequestContextService) {
    const isDevelopment = process.env.NODE_ENV !== 'production'

    this.logger = createLogger({
      level: process.env.LOG_LEVEL || 'debug',
      format: format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        isDevelopment
          ? format.combine(
              format.colorize(),
              format.printf(
                ({
                  timestamp,
                  level,
                  message,
                  context,
                  requestId,
                  userId,
                  ...meta
                }) => {
                  const metaStr = Object.keys(meta).length
                    ? JSON.stringify(meta, null, 2)
                    : ''
                  const requestIdStr = requestId ? `[${requestId}]` : ''
                  const userIdStr = userId ? `[user:${userId}]` : ''
                  const contextStr = context ? `[${context}]` : ''
                  return `${timestamp} ${level} ${requestIdStr}${userIdStr}${contextStr}: ${message} ${metaStr}`
                },
              ),
            )
          : format.json(),
      ),
      transports: [new transports.Console()],
    })
  }

  setContext(context: string) {
    this.context = context
  }

  private enrichLogData(...args: Array<string | Record<string, unknown>>) {
    const requestContext = this.requestContextService.getContext()

    const messages: string[] = []
    let meta: Record<string, unknown> = {}

    args.forEach((arg) => {
      if (typeof arg === 'string') {
        messages.push(arg)
      } else if (typeof arg === 'object' && arg !== null) {
        meta = { ...meta, ...arg }
      } else {
        messages.push(String(arg))
      }
    })

    const logData: Record<string, unknown> = {
      message: messages.join(' '),
      ...meta,
    }

    if (this.context) {
      logData.context = this.context
    }

    if (requestContext?.requestId) {
      logData.requestId = requestContext.requestId
    }

    if (requestContext?.userId) {
      logData.userId = requestContext.userId
    }

    return logData
  }

  log(...args: Array<string | Record<string, unknown>>) {
    this.logger.info(this.enrichLogData(...args))
  }

  error(...args: Array<string | Record<string, unknown>>) {
    this.logger.error(this.enrichLogData(...args))
  }

  warn(...args: Array<string | Record<string, unknown>>) {
    this.logger.warn(this.enrichLogData(...args))
  }

  debug(...args: Array<string | Record<string, unknown>>) {
    this.logger.debug(this.enrichLogData(...args))
  }

  verbose(...args: Array<string | Record<string, unknown>>) {
    this.logger.verbose(this.enrichLogData(...args))
  }
}
