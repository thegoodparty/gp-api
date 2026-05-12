import { describe, expect, it, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import { Reflector } from '@nestjs/core'
import { PinoLogger } from 'nestjs-pino'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { AgentActorTokenController } from './agentActorToken.controller'
import { AgentActorTokenService } from './services/agentActorToken.service'

describe('AgentActorTokenController', () => {
  it('delegates to service.mint with body fields', async () => {
    const mint = vi
      .fn()
      .mockResolvedValue({ token: 'tk_xyz', url: 'https://x.example/abc' })
    const moduleRef = await Test.createTestingModule({
      controllers: [AgentActorTokenController],
      providers: [
        { provide: AgentActorTokenService, useValue: { mint } },
        { provide: PinoLogger, useValue: createMockLogger() },
        Reflector,
      ],
    }).compile()

    const ctrl = moduleRef.get(AgentActorTokenController)
    const result = await ctrl.mint({
      ownerClerkId: 'user_owner',
      expiresInSeconds: 300,
    } as never)

    expect(mint).toHaveBeenCalledWith('user_owner', 300)
    expect(result).toEqual({ token: 'tk_xyz', url: 'https://x.example/abc' })
  })
})
