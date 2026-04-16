import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { M2MToken } from '@clerk/backend'

// TODO: I'm not a fan of this. But I've spent way too much time on it for now.
//  I'd prefer to have a more idiomatic way of composing Guards to accomplish this. But this works for now.
//  More info: https://github.com/nestjs/nest/issues/873#issue-341260645
@Injectable()
export class UserOwnerOrAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const { user, params, m2mToken } = context.switchToHttp().getRequest<{
      user?: { id: number; roles: UserRole[] }
      params: { id: string }
      m2mToken?: M2MToken
    }>()
    return Boolean(
      m2mToken ||
        user?.id === parseInt(params.id) ||
        user?.roles.includes(UserRole.admin),
    )
  }
}
