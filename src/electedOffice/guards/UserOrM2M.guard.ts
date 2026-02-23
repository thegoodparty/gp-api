import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { M2MToken } from '@clerk/backend'
import { User } from '@prisma/client'

@Injectable()
export class UserOrM2MGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const { user, m2mToken } = context.switchToHttp().getRequest<{
      user?: User
      m2mToken?: M2MToken
    }>()
    return Boolean(m2mToken || user)
  }
}
