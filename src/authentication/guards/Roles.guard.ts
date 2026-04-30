import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { UserRole } from '@prisma/client'
import { ROLES_KEY } from '../decorators/Roles.decorator'
import { IncomingRequest } from '@/authentication/authentication.types'
import { effectiveUser } from '@/authentication/util/effectiveUser.util'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    )
    if (!requiredRoles) {
      return true
    }
    const req = context.switchToHttp().getRequest<IncomingRequest>()
    return requiredRoles.some((role) =>
      effectiveUser(req)?.roles?.includes(role),
    )
  }
}
