import { NotFoundException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CampaignPositionsService } from './campaignPositions.service'

const mockUpdateMany = vi.fn()
const mockDeleteMany = vi.fn()

vi.mock('src/prisma/util/prisma.util', () => ({
  MODELS: { CampaignPosition: 'CampaignPosition' },
  createPrismaBase: () =>
    class {
      model = {
        updateMany: mockUpdateMany,
        deleteMany: mockDeleteMany,
      }
    },
}))

describe('CampaignPositionsService', () => {
  let service: CampaignPositionsService

  beforeEach(() => {
    service = new CampaignPositionsService()
  })

  describe('update', () => {
    it('updates when position belongs to campaign', async () => {
      mockUpdateMany.mockResolvedValue({ count: 1 })

      await expect(
        service.update(10, 1, {
          description: 'new',
          order: 2,
        }),
      ).resolves.toBeUndefined()

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { id: 10, campaignId: 1 },
        data: { description: 'new', order: 2 },
      })
    })

    it('throws NotFoundException when position does not belong to campaign', async () => {
      mockUpdateMany.mockResolvedValue({ count: 0 })

      await expect(
        service.update(10, 999, {
          description: 'new',
          order: 2,
        }),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('delete', () => {
    it('deletes when position belongs to campaign', async () => {
      mockDeleteMany.mockResolvedValue({ count: 1 })

      await expect(service.delete(10, 1)).resolves.toBeUndefined()

      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { id: 10, campaignId: 1 },
      })
    })

    it('throws NotFoundException when position does not belong to campaign', async () => {
      mockDeleteMany.mockResolvedValue({ count: 0 })

      await expect(service.delete(10, 999)).rejects.toThrow(NotFoundException)
    })
  })
})
