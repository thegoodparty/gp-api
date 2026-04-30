import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { IncomingRequest } from '@/authentication/authentication.types'
import { effectiveUser } from '@/authentication/util/effectiveUser.util'

// TODO: remove after we sunset the existing admin ENG-6732
@Injectable()
export class AdminOrM2MGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<IncomingRequest>()
    return Boolean(
      req.m2mToken ||
        effectiveUser(req)?.roles.includes(UserRole.admin) ||
        req.user?.impersonating,
    )
  }
}
