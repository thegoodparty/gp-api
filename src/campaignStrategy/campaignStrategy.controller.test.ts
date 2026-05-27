import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Campaign, User } from '@prisma/client'
import { CampaignStrategyController } from './campaignStrategy.controller'
import { CampaignStrategyService } from './services/campaignStrategy.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'

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
  dateVerified: null,
  tier: null,
  formattedAddress: null,
  placeId: null,
  campaignEmail: null,
  data: {},
  details: { party: 'Independent' },
  aiContent: {},
  vendorTsData: {},
  userId: 1,
  canDownloadFederal: false,
  completedTaskIds: [],
  hasFreeTextsOffer: false,
  freeTextsOfferRedeemedAt: null,
  user: sampleUser,
} as Campaign & { user: User }

describe('CampaignStrategyController', () => {
  let controller: CampaignStrategyController
  let service: { getOrGenerateStrategicLandscape: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    service = {
      getOrGenerateStrategicLandscape: vi.fn().mockResolvedValue({
        opportunities: ['o1', 'o2', 'o3'],
        challenges: ['c1', 'c2', 'c3'],
        opponents: [],
      }),
    }
    controller = new CampaignStrategyController(
      service as unknown as CampaignStrategyService,
      createMockLogger(),
    )
  })

  it('delegates to CampaignStrategyService with the loaded campaign', async () => {
    const result = await controller.generateStrategicLandscape(sampleCampaign)

    expect(service.getOrGenerateStrategicLandscape).toHaveBeenCalledWith(
      sampleCampaign,
    )
    expect(result.opportunities).toEqual(['o1', 'o2', 'o3'])
    expect(result.challenges).toEqual(['c1', 'c2', 'c3'])
  })

  it('propagates errors from the service', async () => {
    service.getOrGenerateStrategicLandscape.mockRejectedValueOnce(
      new Error('gemini exploded'),
    )

    await expect(
      controller.generateStrategicLandscape(sampleCampaign),
    ).rejects.toThrow('gemini exploded')
  })
})
