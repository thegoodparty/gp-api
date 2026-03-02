import { randomUUID } from 'crypto'
import { LoggerModule } from 'nestjs-pino'
import pino from 'pino'
import jwt from 'jsonwebtoken'
import { IncomingMessage } from 'http'
import { redactLine } from './log-redaction'

const determineUserId = (req: IncomingMessage): string | undefined => {
  if (!req.headers.authorization) {
    return
  }
  const token = req.headers.authorization.split(' ').at(1)
  if (!token) {
    return
  }
  try {
    return jwt.decode(token, { json: true })?.sub
  } catch {
    return
  }
}

const isLocal = process.env.NODE_ENV !== 'production'

declare module 'http' {
  interface IncomingMessage {
    route?: string
  }
}

export const loggerModule = LoggerModule.forRoot({
  assignResponse: true,
  pinoHttp: {
    base: null,
    level: process.env.LOG_LEVEL,
    transport: isLocal
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
    genReqId: (req) => req.id ?? randomUUID(),
    customProps: (req) => {
      return {
        requestId: req.id,
        user: determineUserId(req),
        request: {
          method: req.method,
          route: req.route,
          // @ts-expect-error - req.originalUrl is not typed
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          url: req.originalUrl,
        },
      }
    },
    customReceivedMessage: () => 'Request received',
    customSuccessMessage: () => 'Request completed',
    customErrorMessage: () => 'Request completed',
    customAttributeKeys: { res: 'response', responseTime: 'responseTimeMs' },
    hooks: {
      streamWrite: redactLine,
    },
    // By default, pino only does proper Error serialization on the `err` argument.
    // This changes that to serialize any Error object on the top-level keys.
    formatters: {
      log: (obj) => {
        for (const key of Object.keys(obj)) {
          if (obj[key] instanceof Error) {
            obj[key] = pino.stdSerializers.err(obj[key])
          }
        }
        return obj
      },
    },
    serializers: {
      req: () => undefined,
      res: (res) => ({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        statusCode: res.statusCode,
        bytes: Number(res.headers['content-length']),
      }),
    },
  },
})
