import {
  ExecutionContext,
  Injectable,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { Reflector } from '@nestjs/core'
import { IS_PUBLIC_KEY } from '../decorators/PublicAccess.decorator'
import { UserRole } from '@prisma/client'
import { ROLES_KEY } from '../decorators/Roles.decorator'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super()
  }

  canActivate(context: ExecutionContext) {
    // Check if the route or class is marked as public
    const isPublic = this.reflector.getAllAndOverride(IS_PUBLIC_KEY, [
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

  handleRequest(err: any, user: any, info: any) {
    // If there's an error or the user object is missing
    if (err || !user) {
      // Handle invalid or expired tokens
      if (
        info &&
        (info.name === 'JsonWebTokenError' || info.name === 'TokenExpiredError')
      ) {
        throw new HttpException(
          {
            statusCode: 498,
            message: 'Invalid or expired token',
          },
          498,
        )
      }

      // For other errors, throw the default UnauthorizedException
      throw err || new UnauthorizedException()
    }

    return user
  }
}
