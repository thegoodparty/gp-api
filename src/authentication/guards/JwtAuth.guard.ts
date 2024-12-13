import { ExecutionContext, Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { Reflector } from '@nestjs/core'
import { IS_PUBLIC_KEY } from '../decorators/PublicAccess.decorator'
import { UserRole } from '@prisma/client'
import { ROLES_KEY } from '../decorators/Roles.decorator'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super()
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    // If the @Roles decorator has been used, we want to override any @PublicAccess
    // decorator that may have been applied, and require the JWT auth
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    // skip JWT auth
    if (isPublic && !roles) return true

    return super.canActivate(context)
  }
}
