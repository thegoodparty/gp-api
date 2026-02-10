import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common'
import { CLERK_CLIENT_PROVIDER_TOKEN } from '@/authentication/providers/clerk-client.provider'
import { ClerkClient } from '@clerk/backend'
import { IncomingRequest } from '@/authentication/authentication.types'
import { verifyM2MToken } from '@/authentication/util/VerifyM2MToken.util'

@Injectable()
export class M2MOnly implements CanActivate {
  constructor(
    @Inject(CLERK_CLIENT_PROVIDER_TOKEN)
    private clerkClient: ClerkClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IncomingRequest>()
    const token = request.headers.authorization?.replace('Bearer ', '')

    if (!token || !token.startsWith('mt_')) {
      return false
    }

    request.m2mToken = await verifyM2MToken(token, this.clerkClient)
    return true
  }
}
