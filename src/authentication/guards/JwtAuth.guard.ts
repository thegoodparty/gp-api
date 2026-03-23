import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { Reflector } from '@nestjs/core'
import { FastifyReply } from 'fastify'
import { User } from '@prisma/client'
import { TokenException } from './token.exception'
import { SessionsService } from '../../users/services/sessions.service'
import { routeIsPublicAndNoRoles } from '@/authentication/util/routeIsPublicAndNoRoles.util'
import { IncomingRequest } from '@/authentication/authentication.types'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private sessions: SessionsService,
  ) {
    super()
  }

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<IncomingRequest>()

    // Skip JWT authentication if the route is public and does not have role restrictions
    if (routeIsPublicAndNoRoles(context, this.reflector) || request.m2mToken) {
      return true
    }

    // Otherwise, require JWT authentication
    return super.canActivate(context)
  }

  handleRequest<TUser extends User = User>(
    err: Error | null,
    user: TUser | false,
    info: Error | null,
    context: ExecutionContext,
  ): TUser {
    // Get the response object from the context
    const response = context.switchToHttp().getResponse() as FastifyReply

    // If there's an error or the user object is missing
    if (err || !user) {
      // Handle invalid or expired tokens
      if (
        info &&
        (info.name === 'JsonWebTokenError' || info.name === 'TokenExpiredError')
      ) {
        throw new TokenException(response)
      }

      // For other errors, throw the default UnauthorizedException
      throw err || new UnauthorizedException()
    }

    // Track the session
    this.sessions.trackSession(user)

    return user
  }
}
