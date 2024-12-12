import { ExecutionContext, Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { Reflector } from '@nestjs/core'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super()
  }

  canActivate(context: ExecutionContext) {
    return (
      this.reflector.getAllAndOverride('isPublic', [
        context.getHandler(),
        context.getClass(),
      ]) || super.canActivate(context)
    )
  }
}
