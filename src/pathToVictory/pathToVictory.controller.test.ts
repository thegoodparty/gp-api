import { NotFoundException } from '@nestjs/common'
import { PathToVictory } from '@prisma/client'
import { P2VStatus } from '@/elections/types/pathToVictory.types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PathToVictoryController } from './pathToVictory.controller'
import { PathToVictoryService } from './services/pathToVictory.service'

const CREATED_AT = '2025-01-01'

const mockP2V: PathToVictory = {
  id: 10,
  createdAt: new Date(CREATED_AT),
  updatedAt: new Date(CREATED_AT),
  campaignId: 100,
  data: {
    p2vStatus: P2VStatus.waiting,
    electionType: 'State_House',
    electionLocation: 'STATE HOUSE 005',
  },
}

const mockP2V2: PathToVictory = {
  id: 11,
  createdAt: new Date(CREATED_AT),
  updatedAt: new Date(CREATED_AT),
  campaignId: 101,
  data: {
    p2vStatus: P2VStatus.complete,
    electionType: 'City_Council',
    electionLocation: 'WARD 3',
    projectedTurnout: 500,
  },
}

describe('PathToVictoryController', () => {
  let controller: PathToVictoryController
  let pathToVictoryService: PathToVictoryService

  beforeEach(() => {
    const pathToVictoryServiceMock: Partial<PathToVictoryService> = {
      listPathToVictories: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    }
    pathToVictoryService = pathToVictoryServiceMock as PathToVictoryService

    controller = new PathToVictoryController(pathToVictoryService)
  })

  describe('list', () => {
    it('returns paginated results with parsed data', async () => {
      vi.spyOn(pathToVictoryService, 'listPathToVictories').mockResolvedValue({
        data: [mockP2V, mockP2V2],
        meta: { total: 2, offset: 0, limit: 100 },
      })

      const result = await controller.list({ offset: 0, limit: 100 })

      expect(pathToVictoryService.listPathToVictories).toHaveBeenCalledWith({
        offset: 0,
        limit: 100,
      })
      expect(result.data).toHaveLength(2)
      expect(result.meta).toEqual({ total: 2, offset: 0, limit: 100 })
    })

    it('returns empty data when no records exist', async () => {
      vi.spyOn(pathToVictoryService, 'listPathToVictories').mockResolvedValue({
        data: [],
        meta: { total: 0, offset: 0, limit: 100 },
      })

      const result = await controller.list({})

      expect(result.data).toEqual([])
      expect(result.meta.total).toBe(0)
    })

    it('passes userId filter to service', async () => {
      vi.spyOn(pathToVictoryService, 'listPathToVictories').mockResolvedValue({
        data: [mockP2V],
        meta: { total: 1, offset: 0, limit: 100 },
      })

      await controller.list({ userId: 42 })

      expect(pathToVictoryService.listPathToVictories).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 42 }),
      )
    })

    it('passes sorting parameters to service', async () => {
      vi.spyOn(pathToVictoryService, 'listPathToVictories').mockResolvedValue({
        data: [],
        meta: { total: 0, offset: 0, limit: 10 },
      })

      await controller.list({
        sortBy: 'updatedAt',
        sortOrder: 'asc',
        limit: 10,
      })

      expect(pathToVictoryService.listPathToVictories).toHaveBeenCalledWith(
        expect.objectContaining({
          sortBy: 'updatedAt',
          sortOrder: 'asc',
          limit: 10,
        }),
      )
    })

    it('parses each P2V record through PathToVictorySchema', async () => {
      vi.spyOn(pathToVictoryService, 'listPathToVictories').mockResolvedValue({
        data: [mockP2V],
        meta: { total: 1, offset: 0, limit: 100 },
      })

      const result = await controller.list({})

      expect(result.data[0]).toHaveProperty('id', mockP2V.id)
      expect(result.data[0]).toHaveProperty('campaignId', mockP2V.campaignId)
      expect(result.data[0]).toHaveProperty('data')
    })
  })

  describe('getById', () => {
    it('returns parsed P2V record', async () => {
      vi.spyOn(pathToVictoryService, 'findUniqueOrThrow').mockResolvedValue(
        mockP2V,
      )

      const result = await controller.getById({ id: 10 })

      expect(pathToVictoryService.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 10 },
      })
      expect(result).toHaveProperty('id', 10)
      expect(result).toHaveProperty('campaignId', 100)
    })

    it('propagates error when record not found', async () => {
      vi.spyOn(pathToVictoryService, 'findUniqueOrThrow').mockRejectedValue(
        new NotFoundException(),
      )

      await expect(controller.getById({ id: 999 })).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  describe('update', () => {
    it('deep merges incoming data with existing record', async () => {
      vi.spyOn(pathToVictoryService, 'findUniqueOrThrow').mockResolvedValue(
        mockP2V,
      )
      const updatedP2V = {
        ...mockP2V,
        data: {
          ...(mockP2V.data as object),
          projectedTurnout: 1000,
        },
      }
      vi.spyOn(pathToVictoryService, 'update').mockResolvedValue(updatedP2V)

      const body = { data: { projectedTurnout: 1000 } }
      const result = await controller.update({ id: 10 }, body)

      expect(pathToVictoryService.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 10 },
      })
      expect(pathToVictoryService.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: {
          data: {
            p2vStatus: P2VStatus.waiting,
            electionType: 'State_House',
            electionLocation: 'STATE HOUSE 005',
            projectedTurnout: 1000,
          },
        },
      })
      expect(result).toHaveProperty('id', 10)
      expect(result).toHaveProperty('data')
    })

    it('preserves all existing fields when updating a single field', async () => {
      vi.spyOn(pathToVictoryService, 'findUniqueOrThrow').mockResolvedValue(
        mockP2V2,
      )
      const updatedP2V = {
        ...mockP2V2,
        data: {
          ...(mockP2V2.data as object),
          winNumber: 300,
        },
      }
      vi.spyOn(pathToVictoryService, 'update').mockResolvedValue(updatedP2V)

      await controller.update({ id: 11 }, { data: { winNumber: 300 } })

      expect(pathToVictoryService.update).toHaveBeenCalledWith({
        where: { id: 11 },
        data: {
          data: {
            p2vStatus: P2VStatus.complete,
            electionType: 'City_Council',
            electionLocation: 'WARD 3',
            projectedTurnout: 500,
            winNumber: 300,
          },
        },
      })
    })

    it('throws when record does not exist', async () => {
      vi.spyOn(pathToVictoryService, 'findUniqueOrThrow').mockRejectedValue(
        new NotFoundException(),
      )

      await expect(
        controller.update({ id: 999 }, { data: {} }),
      ).rejects.toThrow(NotFoundException)
      expect(pathToVictoryService.update).not.toHaveBeenCalled()
    })

    it('propagates error when update fails', async () => {
      vi.spyOn(pathToVictoryService, 'findUniqueOrThrow').mockResolvedValue(
        mockP2V,
      )
      vi.spyOn(pathToVictoryService, 'update').mockRejectedValue(
        new Error('DB error'),
      )

      await expect(controller.update({ id: 10 }, { data: {} })).rejects.toThrow(
        'DB error',
      )
    })
  })
})
