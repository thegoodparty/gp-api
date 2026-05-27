import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { Campaign, CampaignUpdateHistoryType } from '@prisma/client'
import { CampaignUpdateHistoryService } from './campaignUpdateHistory.service'
import { CampaignsService } from '../services/campaigns.service'

const mockModel = {
  findFirstOrThrow: vi.fn(),
  deleteMany: vi.fn(),
}

const mockCampaignsService: Partial<CampaignsService> = {
  update: vi.fn().mockResolvedValue({}),
}

const makeCampaign = (overrides: Partial<Campaign> = {}): Campaign =>
  ({
    id: 1,
    slug: 'test-campaign',
    userId: 10,
    data: {},
    details: {},
    aiContent: {},
    vendorTsData: {},
    isActive: true,
    isDemo: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Campaign

describe('CampaignUpdateHistoryService', () => {
  let service: CampaignUpdateHistoryService

  beforeEach(() => {
    service = new CampaignUpdateHistoryService(
      mockCampaignsService as CampaignsService,
    )
    Object.defineProperty(service, '_prisma', {
      get: () => ({ campaignUpdateHistory: mockModel }),
      configurable: true,
    })
    service.findFirstOrThrow = mockModel.findFirstOrThrow.bind(mockModel)
  })

  describe('delete', () => {
    it('throws when record does not belong to campaign', async () => {
      mockModel.findFirstOrThrow.mockRejectedValue(new NotFoundException())

      await expect(service.delete(99, 2)).rejects.toThrow(NotFoundException)

      expect(mockModel.findFirstOrThrow).toHaveBeenCalledWith({
        where: { id: 99, campaignId: 2 },
        include: { campaign: true },
      })

      expect(mockModel.deleteMany).not.toHaveBeenCalled()
    })

    it('deletes record and decrements voter goals', async () => {
      const campaign = makeCampaign({
        data: {
          reportedVoterGoals: {
            doorKnocking: 100,
          },
        },
      })

      mockModel.findFirstOrThrow.mockResolvedValue({
        id: 5,
        campaignId: 1,
        type: CampaignUpdateHistoryType.doorKnocking,
        quantity: 30,
        campaign,
      })
      mockModel.deleteMany.mockResolvedValue({
        count: 1,
      })

      await service.delete(5, 1)

      expect(mockCampaignsService.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          data: expect.objectContaining({
            reportedVoterGoals: { doorKnocking: 70 },
          }),
        },
      })

      expect(mockModel.deleteMany).toHaveBeenCalledWith({
        where: { id: 5, campaignId: 1 },
      })
    })

    it('skips goal update when no matching voter goals', async () => {
      const campaign = makeCampaign({ data: {} })

      mockModel.findFirstOrThrow.mockResolvedValue({
        id: 7,
        campaignId: 1,
        type: CampaignUpdateHistoryType.calls,
        quantity: 10,
        campaign,
      })
      mockModel.deleteMany.mockResolvedValue({
        count: 1,
      })

      await service.delete(7, 1)

      expect(mockCampaignsService.update).not.toHaveBeenCalled()
      expect(mockModel.deleteMany).toHaveBeenCalledWith({
        where: { id: 7, campaignId: 1 },
      })
    })
  })
})
