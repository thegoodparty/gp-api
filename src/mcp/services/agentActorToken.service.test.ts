import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { Test } from '@nestjs/testing'
import {
  BadGatewayException,
  InternalServerErrorException,
} from '@nestjs/common'
import { AgentActorTokenService } from './agentActorToken.service'
import { CLERK_CLIENT_PROVIDER_TOKEN } from '@/vendors/clerk/providers/clerk-client.provider'

describe('AgentActorTokenService', () => {
  let originalEnv: string | undefined
  beforeEach(() => {
    originalEnv = process.env.AGENT_FLEET_CLERK_ID
    process.env.AGENT_FLEET_CLERK_ID = 'user_agent_fleet'
  })
  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.AGENT_FLEET_CLERK_ID
    } else {
      process.env.AGENT_FLEET_CLERK_ID = originalEnv
    }
  })

  const buildSvc = async (createImpl: (...args: unknown[]) => unknown) => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentActorTokenService,
        {
          provide: CLERK_CLIENT_PROVIDER_TOKEN,
          useValue: { actorTokens: { create: createImpl } },
        },
      ],
    }).compile()
    return moduleRef.get(AgentActorTokenService)
  }

  it('passes ownerClerkId as user_id and AGENT_FLEET_CLERK_ID as actor.sub', async () => {
    const create = vi.fn().mockResolvedValue({
      token: 'tk_abc',
      url: 'https://clerk.example/sign-in/abc',
    })
    const svc = await buildSvc(create)
    const result = await svc.mint('user_owner_xxx', 600)
    expect(result).toEqual({
      token: 'tk_abc',
      url: 'https://clerk.example/sign-in/abc',
    })
    expect(create).toHaveBeenCalledWith({
      userId: 'user_owner_xxx',
      actor: { sub: 'user_agent_fleet' },
      expiresInSeconds: 600,
    })
  })

  it('wraps Clerk failures as BadGatewayException', async () => {
    const create = vi.fn().mockRejectedValue(new Error('clerk down'))
    const svc = await buildSvc(create)
    await expect(svc.mint('user_owner_xxx', 600)).rejects.toThrow(
      BadGatewayException,
    )
  })

  it('rejects when Clerk returns incomplete payload', async () => {
    const create = vi.fn().mockResolvedValue({ token: '', url: '' })
    const svc = await buildSvc(create)
    await expect(svc.mint('user_owner_xxx', 600)).rejects.toThrow(
      BadGatewayException,
    )
  })

  it('returns 500-shaped error when AGENT_FLEET_CLERK_ID unset', async () => {
    delete process.env.AGENT_FLEET_CLERK_ID
    const create = vi.fn()
    const svc = await buildSvc(create)
    await expect(svc.mint('user_owner_xxx', 600)).rejects.toThrow(
      InternalServerErrorException,
    )
    expect(create).not.toHaveBeenCalled()
  })
})
