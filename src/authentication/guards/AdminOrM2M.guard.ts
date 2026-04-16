import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { VerifiedM2MToken } from '@/authentication/interfaces/auth-provider.interface'

// TODO: remove after we sunset the existing admin ENG-6732
@Injectable()
export class AdminOrM2MGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const { user, m2mToken } = context.switchToHttp().getRequest<{
      user?: { roles: UserRole[] }
      m2mToken?: VerifiedM2MToken
    }>()
    return Boolean(m2mToken || user?.roles.includes(UserRole.admin))
  }
}
