import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { CLERK_CLIENT_PROVIDER_TOKEN } from '@/authentication/providers/clerk-client.provider'
import { ClerkClient } from '@clerk/backend'
import { routeIsPublicAndNoRoles } from '@/authentication/util/routeIsPublicAndNoRoles.util'
import { IncomingRequest } from '@/authentication/authentication.types'
import { verifyM2MToken } from '@/authentication/util/VerifyM2MToken.util'
import { M2M_TOKEN_PREFIX } from '../authentication.consts'

@Injectable()
export class ClerkM2MAuthGuard implements CanActivate {
  constructor(
    @Inject(CLERK_CLIENT_PROVIDER_TOKEN)
    private clerkClient: ClerkClient,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IncomingRequest>()
    const token = request.headers.authorization?.replace('Bearer ', '')

    // Skip M2M authentication if this isn't a M2M token or the route is public
    // and does not have role restrictions
    if (
      !token ||
      !token.startsWith(M2M_TOKEN_PREFIX) ||
      routeIsPublicAndNoRoles(context, this.reflector)
    ) {
      return true
    }

    request.m2mToken = await verifyM2MToken(token, this.clerkClient)
    return true
  }
}
