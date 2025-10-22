import { Injectable, NestMiddleware } from '@nestjs/common'
import { FastifyRequest, FastifyReply } from 'fastify'
import { CustomWinstonLogger } from './winston-logger.service'
import { RequestContextService } from './request-context.service'
import jwt, { JwtPayload } from 'jsonwebtoken'

@Injectable()
export class HttpLoggingMiddleware implements NestMiddleware {
  private readonly logger: CustomWinstonLogger

  constructor(private readonly requestContextService: RequestContextService) {
    this.logger = new CustomWinstonLogger(this.requestContextService)
    this.logger.setContext('HTTP')
  }

  private extractUserId(req: FastifyRequest): string | undefined {
    if (!req.headers.authorization) {
      return undefined
    }
    const token = req.headers.authorization.split(' ').at(1)
    if (!token) {
      return undefined
    }
    try {
      const decoded = jwt.verify(token, process.env.AUTH_SECRET!, {
        complete: false,
      }) as JwtPayload

      return decoded.sub || undefined
    } catch {
      return undefined
    }
  }

  use(req: FastifyRequest, res: FastifyReply, next: () => void) {
    const requestId = req.id
    const userId = this.extractUserId(req)
    const startTime = Date.now()

    this.requestContextService.run(
      {
        requestId,
        userId,
        method: req.method,
        url: req.url,
      },
      () => {
        this.logger.log('HTTP request received', {
          method: req.method,
          url: req.url,
          userAgent: req.headers['user-agent'] || '',
          origin: req.headers['origin'] || '',
        })

        res.raw.on('finish', () => {
          const responseTime = Date.now() - startTime
          const { statusCode } = res.raw

          const logLevel =
            statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'log'

          this.logger[logLevel]('HTTP response sent', {
            method: req.method,
            url: req.url,
            statusCode,
            responseTimeMs: responseTime,
            contentType: res.getHeader('content-type')?.toString() || '',
          })
        })

        next()
      },
    )
  }
}
