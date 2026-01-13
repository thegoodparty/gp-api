import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
import { User, UserRole } from '@prisma/client'
import { FastifyReply } from 'fastify'
import { SessionsService } from '../../users/services/sessions.service'
import { IS_PUBLIC_KEY } from '../decorators/PublicAccess.decorator'
import { ROLES_KEY } from '../decorators/Roles.decorator'
import { TokenException } from './token.exception'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private sessions: SessionsService,
  ) {
    super()
  }

  canActivate(context: ExecutionContext) {
    // Check if the route or class is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    // Check if the route or class has specific roles specified
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    // Skip JWT authentication if the route is public and does not have role restrictions
    if (isPublic && !roles) {
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
