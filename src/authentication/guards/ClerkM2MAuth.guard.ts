import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { CLERK_CLIENT_PROVIDER_TOKEN } from '@/authentication/providers/clerk-client.provider'
import { ClerkClient } from '@clerk/backend'
import { routeIsPublicAndNoRoles } from '@/authentication/util/routeIsPublicAndNoRoles.util'
import { IncomingRequest } from '@/authentication/authentication.types'

const { CLERK_SECRET_KEY, GP_WEBAPP_MACHINE_SECRET } = process.env

if (!CLERK_SECRET_KEY || !GP_WEBAPP_MACHINE_SECRET)
  throw new Error(
    'CLERK_SECRET_KEY and GP_WEBAPP_MACHINE_SECRET must be set in the environment variables',
  )

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
      !token.startsWith('mt_') ||
      routeIsPublicAndNoRoles(context, this.reflector)
    ) {
      return true
    }

    try {
      // Verify M2M token using your NestJS machine's secret
      const verified = await this.clerkClient.m2m.verify({
        token,
        machineSecretKey: GP_WEBAPP_MACHINE_SECRET,
      })

      // Attach to request for downstream use
      request.m2mToken = verified
      return true
    } catch (error) {
      throw new UnauthorizedException('Invalid M2M token')
    }
  }
}
