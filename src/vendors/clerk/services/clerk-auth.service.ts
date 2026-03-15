import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { verifyToken, ClerkClient } from '@clerk/backend'
import {
  AuthProvider,
  VerifiedM2MToken,
  VerifiedSession,
} from '@/authentication/interfaces/auth-provider.interface'
import { CLERK_CLIENT_PROVIDER_TOKEN } from '@/vendors/clerk/providers/clerk-client.provider'
import { M2M_TOKEN_PREFIX } from '@/vendors/clerk/clerk.consts'

const { CLERK_SECRET_KEY, GP_WEBAPP_MACHINE_SECRET } = process.env

if (!CLERK_SECRET_KEY) {
  throw new Error('CLERK_SECRET_KEY is required for application startup')
}

if (!GP_WEBAPP_MACHINE_SECRET) {
  throw new Error(
    'GP_WEBAPP_MACHINE_SECRET must be set in the environment variables',
  )
}

@Injectable()
export class ClerkAuthService implements AuthProvider {
  constructor(
    @Inject(CLERK_CLIENT_PROVIDER_TOKEN)
    private clerkClient: ClerkClient,
  ) {}

  async verifySessionToken(token: string): Promise<VerifiedSession> {
    const payload = await verifyToken(token, {
      secretKey: CLERK_SECRET_KEY,
    })

    const externalUserId = payload.sub
    if (!externalUserId) {
      throw new Error('Token missing sub claim')
    }

    return { externalUserId }
  }

  async verifyM2MToken(token: string): Promise<VerifiedM2MToken> {
    try {
      const { id, subject } = await this.clerkClient.m2m.verify({
        token,
        machineSecretKey: GP_WEBAPP_MACHINE_SECRET,
      })
      return { id, subject }
    } catch {
      throw new UnauthorizedException('M2M token verification failed')
    }
  }

  isM2MToken(token: string): boolean {
    return token.startsWith(M2M_TOKEN_PREFIX)
  }

  async getUser(
    externalUserId: string,
  ): Promise<{ email?: string; firstName?: string; lastName?: string } | null> {
    try {
      const clerkUser = await this.clerkClient.users.getUser(externalUserId)
      const email =
        clerkUser.primaryEmailAddress?.emailAddress ??
        clerkUser.emailAddresses?.[0]?.emailAddress

      return {
        email: email ?? undefined,
        firstName: clerkUser.firstName ?? undefined,
        lastName: clerkUser.lastName ?? undefined,
      }
    } catch {
      return null
    }
  }
}
