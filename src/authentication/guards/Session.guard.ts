import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { User } from '@prisma/client'
import { PinoLogger } from 'nestjs-pino'
import {
  AUTH_PROVIDER_TOKEN,
  AuthProvider,
} from '@/authentication/interfaces/auth-provider.interface'
import { IncomingRequest } from '@/authentication/authentication.types'
import { routeIsPublicAndNoRoles } from '@/authentication/util/routeIsPublicAndNoRoles.util'
import { UsersService } from '@/users/services/users.service'
import { SessionsService } from '@/users/services/sessions.service'
import { ClerkUserEnricherService } from '@/vendors/clerk/services/clerk-user-enricher.service'

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(AUTH_PROVIDER_TOKEN)
    private authProvider: AuthProvider,
    private usersService: UsersService,
    private sessions: SessionsService,
    private readonly clerkEnricher: ClerkUserEnricherService,
    private readonly logger: PinoLogger,
    private readonly reflector: Reflector,
  ) {
    this.logger.setContext(SessionGuard.name)
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IncomingRequest>()
    const token = request.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return this.allowPublicOrThrow(context)
    }

    if (this.authProvider.isM2MToken(token)) {
      try {
        request.m2mToken = await this.authProvider.verifyM2MToken(token)
        return true
      } catch {
        this.logger.debug('M2M token verification failed in SessionGuard')
        return this.allowPublicOrThrow(context)
      }
    }

    try {
      const { externalUserId, actor } =
        await this.authProvider.verifySessionToken(token)

      if (actor?.sub) {
        request.actorSub = actor.sub
      }

      const [user, actorUser] = await Promise.all([
        this.resolveUser(externalUserId, 'subject'),
        actor ? this.resolveUser(actor.sub, 'actor') : Promise.resolve(null),
      ])

      if (!user) {
        this.logger.warn(
          `Could not find or provision user for externalUserId: ${externalUserId}`,
        )
        return this.allowPublicOrThrow(context)
      }

      if (actor && !actorUser) {
        this.logger.warn(
          { actorSub: actor.sub },
          'Actor claim present but actor could not be resolved — continuing without actor privileges',
        )
      }

      request.user = {
        ...user,
        impersonating: actor != null,
      }
      if (actorUser) {
        request.actorUser = actorUser
      }
      this.sessions.trackSession(user)
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err
      }
      this.logger.debug('Session token verification failed')
      return this.allowPublicOrThrow(context)
    }

    return true
  }

  private allowPublicOrThrow(context: ExecutionContext): true {
    if (routeIsPublicAndNoRoles(context, this.reflector)) {
      return true
    }
    throw new UnauthorizedException()
  }

  private async resolveUser(
    externalUserId: string,
    role: 'subject' | 'actor' = 'subject',
  ): Promise<User | null> {
    if (!externalUserId.startsWith('user_')) {
      return null
    }

    const [rawUser, clerkFields] = await Promise.all([
      this.usersService.model.findUnique({
        where: { clerkId: externalUserId },
      }),
      this.clerkEnricher.fetchClerkFields(externalUserId),
    ])

    if (rawUser) {
      if (!clerkFields) {
        // Clerk unreachable: keep DB identity fields but never serve a stale
        // local avatar as if it were Clerk's (see ClerkUserEnricherService).
        return { ...rawUser, avatar: null }
      }
      // Use `||` (not `??`) so empty strings from Clerk also fall back to the
      // DB value, matching the truthiness check in
      // ClerkUserEnricherService.applyFields. `??` would only catch
      // null/undefined and let `''` through, which can fail downstream
      // schema validation (e.g. EmailSchema, firstName.min(2)).
      return {
        ...rawUser,
        email: clerkFields.email || rawUser.email,
        firstName: clerkFields.firstName || rawUser.firstName,
        lastName: clerkFields.lastName || rawUser.lastName,
        name: clerkFields.name || rawUser.name,
        avatar: clerkFields.avatar,
      }
    }

    if (role === 'actor') {
      return null
    }

    try {
      const providerUser = await this.authProvider.getUser(externalUserId)
      if (!providerUser?.email) {
        this.logger.warn(
          { clerkId: externalUserId, role },
          'Auth provider user has no email address, cannot provision',
        )
        return null
      }

      return this.usersService.findOrProvisionByClerk({
        clerkId: externalUserId,
        email: providerUser.email,
        firstName: providerUser.firstName ?? '',
        lastName: providerUser.lastName ?? '',
      })
    } catch (err) {
      this.logger.error(
        { err, clerkId: externalUserId, role },
        'Failed to provision user from auth provider',
      )
      return null
    }
  }
}
