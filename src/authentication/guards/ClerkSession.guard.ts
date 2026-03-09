import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { verifyToken, ClerkClient } from '@clerk/backend'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { User } from '@prisma/client'
import { PinoLogger } from 'nestjs-pino'
import { CLERK_CLIENT_PROVIDER_TOKEN } from '@/authentication/providers/clerk-client.provider'
import { IncomingRequest } from '@/authentication/authentication.types'
import { verifyM2MToken } from '@/authentication/util/VerifyM2MToken.util'
import { routeIsPublicAndNoRoles } from '@/authentication/util/routeIsPublicAndNoRoles.util'
import { M2M_TOKEN_PREFIX } from '../authentication.consts'
import { UsersService } from '@/users/services/users.service'
import { SessionsService } from '@/users/services/sessions.service'

const { CLERK_SECRET_KEY } = process.env

if (!CLERK_SECRET_KEY) {
  throw new Error('CLERK_SECRET_KEY is required for application startup')
}

@Injectable()
export class ClerkSessionGuard implements CanActivate {
  constructor(
    @Inject(CLERK_CLIENT_PROVIDER_TOKEN)
    private clerkClient: ClerkClient,
    private usersService: UsersService,
    private sessions: SessionsService,
    private readonly logger: PinoLogger,
    private readonly reflector: Reflector,
  ) {
    this.logger.setContext(ClerkSessionGuard.name)
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IncomingRequest>()
    const token = request.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      if (routeIsPublicAndNoRoles(context, this.reflector)) {
        return true
      }
      throw new UnauthorizedException()
    }

    if (token.startsWith(M2M_TOKEN_PREFIX)) {
      try {
        request.m2mToken = await verifyM2MToken(token, this.clerkClient)
        return true
      } catch {
        this.logger.debug('M2M token verification failed in ClerkSessionGuard')
        if (routeIsPublicAndNoRoles(context, this.reflector)) {
          return true
        }
        throw new UnauthorizedException()
      }
    }

    try {
      const payload = await verifyToken(token, {
        secretKey: CLERK_SECRET_KEY,
      })

      const clerkId = payload.sub
      if (!clerkId) {
        this.logger.debug('Clerk token missing sub claim')
        if (routeIsPublicAndNoRoles(context, this.reflector)) {
          return true
        }
        throw new UnauthorizedException()
      }

      const user =
        (await this.usersService.findUser({ clerkId })) ??
        (await this.provisionUserFromClerk(clerkId))

      if (!user) {
        this.logger.warn(
          `Could not find or provision user for clerkId: ${clerkId}`,
        )
        if (routeIsPublicAndNoRoles(context, this.reflector)) {
          return true
        }
        throw new UnauthorizedException()
      }

      request.user = user
      this.sessions.trackSession(user)
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err
      }
      this.logger.debug('Clerk session token verification failed')
      if (routeIsPublicAndNoRoles(context, this.reflector)) {
        return true
      }
      throw new UnauthorizedException()
    }

    return true
  }

  private async provisionUserFromClerk(clerkId: string): Promise<User | null> {
    try {
      const clerkUser = await this.clerkClient.users.getUser(clerkId)
      const email =
        clerkUser.primaryEmailAddress?.emailAddress ??
        clerkUser.emailAddresses?.[0]?.emailAddress
      if (!email) {
        this.logger.warn(
          { clerkId },
          'Clerk user has no email address, cannot provision',
        )
        return null
      }

      const existingByEmail = await this.usersService.findUserByEmail(email)
      if (existingByEmail) {
        this.logger.info(
          { userId: existingByEmail.id, clerkId },
          'Linking existing user to Clerk account via JIT provisioning',
        )
        return this.usersService.updateUser(
          { id: existingByEmail.id },
          { clerkId },
        )
      }

      const user = await this.usersService.createUserFromClerk({
        clerkId,
        email,
        firstName: clerkUser.firstName ?? '',
        lastName: clerkUser.lastName ?? '',
      })
      this.logger.info(
        { userId: user.id, clerkId },
        'Created new user via JIT provisioning',
      )
      return user
    } catch (err) {
      if (this.isPrismaUniqueConstraintError(err)) {
        this.logger.debug(
          { clerkId },
          'Concurrent JIT provisioning detected, fetching existing user',
        )
        return this.usersService.findUser({ clerkId })
      }
      this.logger.error({ err, clerkId }, 'Failed to provision user from Clerk')
      return null
    }
  }

  private isPrismaUniqueConstraintError(err: unknown): boolean {
    return err instanceof PrismaClientKnownRequestError && err.code === 'P2002'
  }
}
