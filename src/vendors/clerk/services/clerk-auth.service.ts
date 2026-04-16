import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { verifyToken, ClerkClient } from '@clerk/backend'
import { PinoLogger } from 'nestjs-pino'
import {
  AuthProvider,
  VerifiedM2MToken,
  VerifiedSession,
} from '@/authentication/interfaces/auth-provider.interface'
import { CLERK_CLIENT_PROVIDER_TOKEN } from '@/vendors/clerk/providers/clerk-client.provider'
import { M2M_TOKEN_PREFIX } from '@/vendors/clerk/clerk.consts'

const { CLERK_SECRET_KEY, GP_WEBAPP_MACHINE_SECRET, CLERK_AUTHORIZED_PARTIES } =
  process.env

if (!CLERK_SECRET_KEY) {
  throw new Error('CLERK_SECRET_KEY is required for application startup')
}

if (!GP_WEBAPP_MACHINE_SECRET) {
  throw new Error(
    'GP_WEBAPP_MACHINE_SECRET must be set in the environment variables',
  )
}

const authorizedParties = CLERK_AUTHORIZED_PARTIES
  ? CLERK_AUTHORIZED_PARTIES.split(',')
  : undefined

function isActorClaim(
  act: Record<string, unknown> | undefined,
): act is { sub: string } {
  return (
    typeof act === 'object' &&
    act !== null &&
    'sub' in act &&
    typeof act.sub === 'string'
  )
}

@Injectable()
export class ClerkAuthService implements AuthProvider {
  constructor(
    @Inject(CLERK_CLIENT_PROVIDER_TOKEN)
    private clerkClient: ClerkClient,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ClerkAuthService.name)
  }

  async verifySessionToken(token: string): Promise<VerifiedSession> {
    const payload = await verifyToken(token, {
      secretKey: CLERK_SECRET_KEY,
      authorizedParties,
    }).catch(() => {
      throw new UnauthorizedException('Session token verification failed')
    })

    const externalUserId = payload.sub
    if (!externalUserId) {
      throw new UnauthorizedException('Token missing sub claim')
    }

    return {
      externalUserId,
      actor: isActorClaim(payload.act) ? payload.act : undefined,
    }
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

  async getUser(externalUserId: string): Promise<{
    email?: string
    firstName?: string
    lastName?: string
  } | null> {
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
    } catch (err) {
      this.logger.error(
        { err, externalUserId },
        'Failed to fetch user from Clerk',
      )
      return null
    }
  }
}
