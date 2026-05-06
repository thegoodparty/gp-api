import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common'
import type { IncomingRequest } from '@/authentication/authentication.types'

@Injectable()
export class AgentActorGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const expected = process.env.AGENT_FLEET_CLERK_ID
    if (!expected) {
      throw new InternalServerErrorException(
        'AGENT_FLEET_CLERK_ID env var is not configured; agent routes are disabled',
      )
    }
    const req = ctx.switchToHttp().getRequest<IncomingRequest>()
    if (req.actorSub !== expected) {
      throw new ForbiddenException(
        'This route is only accessible to agent-actor sessions',
      )
    }
    return true
  }
}
