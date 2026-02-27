import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { M2MToken } from '@clerk/backend'

@Injectable()
export class AdminOrM2MGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const { user, m2mToken } = context.switchToHttp().getRequest<{
      user?: { roles?: UserRole[] }
      m2mToken?: M2MToken
    }>()
    return Boolean(m2mToken || user?.roles?.includes(UserRole.admin))
  }
}
