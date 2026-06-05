import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { VerifiedM2MToken } from '@/authentication/interfaces/auth-provider.interface'
import { User } from '../../generated/prisma'

@Injectable()
export class UserOrM2MGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const { user, m2mToken } = context.switchToHttp().getRequest<{
      user?: User
      m2mToken?: VerifiedM2MToken
    }>()
    return Boolean(m2mToken || user)
  }
}
