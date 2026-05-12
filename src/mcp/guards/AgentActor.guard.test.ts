import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  ForbiddenException,
  InternalServerErrorException,
  ExecutionContext,
} from '@nestjs/common'
import { AgentActorGuard } from './AgentActor.guard'

const ctxFor = (req: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  }) as unknown as ExecutionContext

describe('AgentActorGuard', () => {
  let originalEnv: string | undefined
  beforeEach(() => {
    originalEnv = process.env.AGENT_FLEET_CLERK_ID
  })
  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.AGENT_FLEET_CLERK_ID
    } else {
      process.env.AGENT_FLEET_CLERK_ID = originalEnv
    }
  })

  it('allows when actorSub matches AGENT_FLEET_CLERK_ID', () => {
    process.env.AGENT_FLEET_CLERK_ID = 'user_agent_fleet'
    const guard = new AgentActorGuard()
    expect(guard.canActivate(ctxFor({ actorSub: 'user_agent_fleet' }))).toBe(
      true,
    )
  })

  it('forbids when actorSub does not match', () => {
    process.env.AGENT_FLEET_CLERK_ID = 'user_agent_fleet'
    const guard = new AgentActorGuard()
    expect(() =>
      guard.canActivate(ctxFor({ actorSub: 'someone_else' })),
    ).toThrow(ForbiddenException)
  })

  it('forbids when no actor claim is present', () => {
    process.env.AGENT_FLEET_CLERK_ID = 'user_agent_fleet'
    const guard = new AgentActorGuard()
    expect(() => guard.canActivate(ctxFor({}))).toThrow(ForbiddenException)
  })

  it('returns 500-shaped error when AGENT_FLEET_CLERK_ID is unset', () => {
    delete process.env.AGENT_FLEET_CLERK_ID
    const guard = new AgentActorGuard()
    expect(() => guard.canActivate(ctxFor({ actorSub: 'x' }))).toThrow(
      InternalServerErrorException,
    )
  })
})
