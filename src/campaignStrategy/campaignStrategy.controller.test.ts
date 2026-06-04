import { Campaign, User } from '@prisma/client'
import { HttpStatus } from '@nestjs/common'
import { FastifyReply } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { CampaignStrategyController } from './campaignStrategy.controller'
import { CampaignStrategyService } from './services/campaignStrategy.service'

const sampleUser = {
  id: 1,
  firstName: 'Jane',
  lastName: 'Doe',
  name: 'Jane Doe',
  email: 'jane@example.com',
} as User

const sampleCampaign = {
  id: 99,
  organizationSlug: 'campaign-99',
  slug: 'jane-doe',
  createdAt: new Date(),
  updatedAt: new Date(),
  isActive: true,
  isVerified: false,
  isPro: false,
  isDemo: false,
  didWin: null,
  primaryResult: null,
  dateVerified: null,
  tier: null,
  formattedAddress: null,
  placeId: null,
  campaignEmail: null,
  data: {},
  details: { party: 'Independent', raceId: 'hash-abc' },
  aiContent: {},
  vendorTsData: {},
  userId: 1,
  canDownloadFederal: false,
  completedTaskIds: [],
  hasFreeTextsOffer: false,
  freeTextsOfferRedeemedAt: null,
  user: sampleUser,
} as Campaign & { user: User }

const buildReply = (): {
  reply: FastifyReply
  status: ReturnType<typeof vi.fn>
} => {
  const status = vi.fn()
  const reply = { status } as unknown as FastifyReply
  return { reply, status }
}

describe('CampaignStrategyController', () => {
  let controller: CampaignStrategyController
  let service: {
    getOrGenerateStrategicLandscape: ReturnType<typeof vi.fn>
    getOrGenerateCommunityEvents: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    service = {
      getOrGenerateStrategicLandscape: vi.fn(),
      getOrGenerateCommunityEvents: vi.fn(),
    }
    controller = new CampaignStrategyController(
      service as unknown as CampaignStrategyService,
      createMockLogger(),
    )
  })

  it('returns the ready body and leaves the default 200 status when cached', async () => {
    const data = {
      opportunities: ['o1', 'o2', 'o3'],
      challenges: ['c1', 'c2', 'c3'],
      opponents: [],
    }
    service.getOrGenerateStrategicLandscape.mockResolvedValueOnce({
      status: 'ready',
      data,
    })
    const { reply, status } = buildReply()

    const result = await controller.generateStrategicLandscape(
      sampleCampaign,
      reply,
    )

    expect(service.getOrGenerateStrategicLandscape).toHaveBeenCalledWith(
      sampleCampaign,
    )
    expect(result).toEqual({ status: 'ready', data })
    expect(status).not.toHaveBeenCalled()
  })

  it('returns 202 ACCEPTED + generating body while a background run is in flight', async () => {
    service.getOrGenerateStrategicLandscape.mockResolvedValueOnce({
      status: 'generating',
    })
    const { reply, status } = buildReply()

    const result = await controller.generateStrategicLandscape(
      sampleCampaign,
      reply,
    )

    expect(result).toEqual({ status: 'generating' })
    expect(status).toHaveBeenCalledWith(HttpStatus.ACCEPTED)
  })

  it('propagates errors from the service', async () => {
    service.getOrGenerateStrategicLandscape.mockRejectedValueOnce(
      new Error('gemini exploded'),
    )
    const { reply } = buildReply()

    await expect(
      controller.generateStrategicLandscape(sampleCampaign, reply),
    ).rejects.toThrow('gemini exploded')
  })

  describe('generateCommunityEvents', () => {
    it('returns the ready body and leaves default 200 status when cached', async () => {
      const data = {
        events: [
          {
            title: 'Town Hall',
            description: 'Why',
            date: '2026-10-15',
            address: null,
            url: null,
          },
        ],
      }
      service.getOrGenerateCommunityEvents.mockResolvedValueOnce({
        status: 'ready',
        data,
      })
      const { reply, status } = buildReply()

      const result = await controller.generateCommunityEvents(
        sampleCampaign,
        reply,
      )

      expect(service.getOrGenerateCommunityEvents).toHaveBeenCalledWith(
        sampleCampaign,
      )
      expect(result).toEqual({ status: 'ready', data })
      expect(status).not.toHaveBeenCalled()
    })

    it('returns 202 ACCEPTED + generating body while a background run is in flight', async () => {
      service.getOrGenerateCommunityEvents.mockResolvedValueOnce({
        status: 'generating',
      })
      const { reply, status } = buildReply()

      const result = await controller.generateCommunityEvents(
        sampleCampaign,
        reply,
      )

      expect(result).toEqual({ status: 'generating' })
      expect(status).toHaveBeenCalledWith(HttpStatus.ACCEPTED)
    })
  })
})
