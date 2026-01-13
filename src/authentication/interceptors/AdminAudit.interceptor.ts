import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { User, UserRole } from '@prisma/client'
import { ROLES_KEY } from '../decorators/Roles.decorator'
import { FastifyRequest } from 'fastify'

@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AdminAudit')

  constructor(private reflector: Reflector) {}

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

    this.logger.log(
      JSON.stringify({ ...auditInfo, msg: 'Admin route accessed' }),
    )

    return next.handle()
  }
}
