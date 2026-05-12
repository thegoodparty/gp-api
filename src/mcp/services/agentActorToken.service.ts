import {
  BadGatewayException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common'
import type { ActorToken, ClerkClient } from '@clerk/backend'
import { CLERK_CLIENT_PROVIDER_TOKEN } from '@/vendors/clerk/providers/clerk-client.provider'

@Injectable()
export class AgentActorTokenService {
  constructor(
    @Inject(CLERK_CLIENT_PROVIDER_TOKEN)
    private readonly clerk: ClerkClient,
  ) {}

  async mint(ownerClerkId: string, expiresInSeconds: number) {
    const agentFleetClerkId = process.env.AGENT_FLEET_CLERK_ID
    if (!agentFleetClerkId) {
      throw new InternalServerErrorException(
        'AGENT_FLEET_CLERK_ID env var is not configured; agent token minting is disabled',
      )
    }

    let result: ActorToken
    try {
      result = await this.clerk.actorTokens.create({
        userId: ownerClerkId,
        actor: { sub: agentFleetClerkId },
        expiresInSeconds,
      })
    } catch (err) {
      throw new BadGatewayException({
        reason: 'clerk_actor_token_create_failed',
        err: err instanceof Error ? err.message : String(err),
      })
    }

    if (!result.token || !result.url) {
      throw new BadGatewayException(
        'Clerk did not return a complete actor token',
      )
    }
    return { url: result.url, token: result.token }
  }
}
