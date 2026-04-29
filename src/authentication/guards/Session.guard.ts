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

      const user = await this.resolveUser(externalUserId)

      if (!user) {
        this.logger.warn(
          `Could not find or provision user for externalUserId: ${externalUserId}`,
        )
        return this.allowPublicOrThrow(context)
      }

      request.user = {
        ...user,
        impersonating: actor != null,
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

  private async resolveUser(externalUserId: string): Promise<User | null> {
    const [rawUser, clerkFields] = await Promise.all([
      this.usersService.model.findUnique({
        where: { clerkId: externalUserId },
      }),
      this.clerkEnricher.fetchClerkFields(externalUserId),
    ])

    if (rawUser) {
      return clerkFields
        ? {
            ...rawUser,
            email: clerkFields.email ?? rawUser.email,
            firstName: clerkFields.firstName ?? rawUser.firstName,
            lastName: clerkFields.lastName ?? rawUser.lastName,
            name: clerkFields.name ?? rawUser.name,
            avatar: clerkFields.avatar,
          }
        : rawUser
    }

    try {
      const providerUser = await this.authProvider.getUser(externalUserId)
      if (!providerUser?.email) {
        this.logger.warn(
          { externalUserId },
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
        { err, externalUserId },
        'Failed to provision user from auth provider',
      )
      return null
    }
  }
}
