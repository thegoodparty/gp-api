import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { Campaign, CampaignUpdateHistoryType } from '@prisma/client'
import { CampaignUpdateHistoryService } from './campaignUpdateHistory.service'
import { CampaignsService } from '../services/campaigns.service'

const mockDeleteMany = vi.fn()
const mockCampaignFindUniqueOrThrow = vi.fn()
const mockCampaignUpdate = vi.fn()
const mockExecuteRaw = vi.fn()

const mockTx = {
  campaignUpdateHistory: { deleteMany: mockDeleteMany },
  campaign: {
    findUniqueOrThrow: mockCampaignFindUniqueOrThrow,
    update: mockCampaignUpdate,
  },
  $executeRaw: mockExecuteRaw,
}

const mockTransaction = vi.fn(
  async (cb: (tx: typeof mockTx) => Promise<void>) => {
    await cb(mockTx)
  },
)

const mockFindFirstOrThrow = vi.fn()

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
      get: () => ({
        campaignUpdateHistory: {},
        $transaction: mockTransaction,
      }),
      configurable: true,
    })
    service.findFirstOrThrow = mockFindFirstOrThrow
  })

  describe('delete', () => {
    it('throws when record does not belong to campaign', async () => {
      mockFindFirstOrThrow.mockRejectedValue(new NotFoundException())

      await expect(service.delete(99, 2)).rejects.toThrow(NotFoundException)

      expect(mockFindFirstOrThrow).toHaveBeenCalledWith({
        where: { id: 99, campaignId: 2 },
      })

      expect(mockTransaction).not.toHaveBeenCalled()
    })

    it('deletes record and decrements voter goals', async () => {
      const campaign = makeCampaign({
        data: {
          reportedVoterGoals: { doorKnocking: 100 },
        },
      })

      mockFindFirstOrThrow.mockResolvedValue({
        id: 5,
        campaignId: 1,
        type: CampaignUpdateHistoryType.doorKnocking,
        quantity: 30,
      })
      mockDeleteMany.mockResolvedValue({ count: 1 })
      mockCampaignFindUniqueOrThrow.mockResolvedValue(campaign)
      mockCampaignUpdate.mockResolvedValue({})

      await service.delete(5, 1)

      expect(mockExecuteRaw).toHaveBeenCalled()
      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { id: 5, campaignId: 1 },
      })

      expect(mockCampaignUpdate).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          data: expect.objectContaining({
            reportedVoterGoals: { doorKnocking: 70 },
          }),
        },
      })
    })

    it('skips goal update when deleteMany returns zero rows', async () => {
      mockFindFirstOrThrow.mockResolvedValue({
        id: 7,
        campaignId: 1,
        type: CampaignUpdateHistoryType.calls,
        quantity: 10,
      })
      mockDeleteMany.mockResolvedValue({ count: 0 })

      await service.delete(7, 1)

      expect(mockExecuteRaw).toHaveBeenCalled()
      expect(mockCampaignFindUniqueOrThrow).not.toHaveBeenCalled()
      expect(mockCampaignUpdate).not.toHaveBeenCalled()
    })

    it('skips goal update when no matching voter goals', async () => {
      mockFindFirstOrThrow.mockResolvedValue({
        id: 7,
        campaignId: 1,
        type: CampaignUpdateHistoryType.calls,
        quantity: 10,
      })
      mockDeleteMany.mockResolvedValue({ count: 1 })
      mockCampaignFindUniqueOrThrow.mockResolvedValue(
        makeCampaign({ data: {} }),
      )

      await service.delete(7, 1)

      expect(mockExecuteRaw).toHaveBeenCalled()
      expect(mockCampaignUpdate).not.toHaveBeenCalled()
    })

    it('clamps voter goal at zero', async () => {
      const campaign = makeCampaign({
        data: {
          reportedVoterGoals: { doorKnocking: 5 },
        },
      })

      mockFindFirstOrThrow.mockResolvedValue({
        id: 8,
        campaignId: 1,
        type: CampaignUpdateHistoryType.doorKnocking,
        quantity: 20,
      })
      mockDeleteMany.mockResolvedValue({ count: 1 })
      mockCampaignFindUniqueOrThrow.mockResolvedValue(campaign)
      mockCampaignUpdate.mockResolvedValue({})

      await service.delete(8, 1)

      expect(mockExecuteRaw).toHaveBeenCalled()
      expect(mockCampaignUpdate).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          data: expect.objectContaining({
            reportedVoterGoals: { doorKnocking: 0 },
          }),
        },
      })
    })
  })
})
