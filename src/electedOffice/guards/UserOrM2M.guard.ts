import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { M2MToken } from '@clerk/backend'

@Injectable()
export class UserOrM2MGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const { user, m2mToken } = context.switchToHttp().getRequest<{
      user?: { id: number }
      m2mToken?: M2MToken
    }>()
    return Boolean(m2mToken || user)
  }
}
