import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { User, UserRole } from '@prisma/client'
import { ROLES_KEY } from '../decorators/Roles.decorator'
import { FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'

@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext('AdminAudit')
  }

  intercept(context: ExecutionContext, next: CallHandler) {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    )

    if (!requiredRoles?.includes(UserRole.admin)) {
      return next.handle()
    }

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user: User }>()

    const { user, method, url, ip, headers, body } = request

    const auditInfo = {
      timestamp: new Date().toISOString(),
      userId: user?.id,
      userEmail: user?.email,
      endpoint: url,
      httpMethod: method,
      ipAddress: ip || headers['x-forwarded-for'] || headers['x-real-ip'],
      userAgent: headers['user-agent'],
      requiredRoles,
      body,
    }

    this.logger.info({ ...auditInfo, msg: 'Admin route accessed' })

    return next.handle()
  }
}
