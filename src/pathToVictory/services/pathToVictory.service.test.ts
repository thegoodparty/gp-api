import { PrismaService } from '@/prisma/prisma.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { Test, TestingModule } from '@nestjs/testing'
import { PinoLogger } from 'nestjs-pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PathToVictoryService } from './pathToVictory.service'

const mockRecordBlockedStateEvent = vi.fn()
vi.mock('src/observability/grafana/otel.client', () => ({
  recordBlockedStateEvent: (...args: unknown[]) =>
    mockRecordBlockedStateEvent(...args),
}))

describe('PathToVictoryService', () => {
  let service: PathToVictoryService
  let mockPrisma: {
    campaign: { findUnique: ReturnType<typeof vi.fn> }
    pathToVictory: {
      create: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
      findUnique: ReturnType<typeof vi.fn>
      findUniqueOrThrow: ReturnType<typeof vi.fn>
      findMany: ReturnType<typeof vi.fn>
      count: ReturnType<typeof vi.fn>
    }
    organization: {
      update: ReturnType<typeof vi.fn>
    }
  }

  beforeEach(async () => {
    mockPrisma = {
      campaign: { findUnique: vi.fn() },
      pathToVictory: {
        create: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      organization: {
        update: vi.fn().mockResolvedValue({}),
      },
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PathToVictoryService,
        { provide: PinoLogger, useValue: createMockLogger() },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get<PathToVictoryService>(PathToVictoryService)

    const mockLogger = createMockLogger()
    Object.defineProperty(service, 'logger', {
      get: () => mockLogger,
      configurable: true,
    })

    vi.clearAllMocks()
  })

  describe('listPathToVictories', () => {
    it('returns paginated results with default parameters', async () => {
      const mockRecords = [
        { id: 1, campaignId: 100, data: {} },
        { id: 2, campaignId: 101, data: {} },
      ]
      mockPrisma.pathToVictory.findMany.mockResolvedValue(mockRecords)
      mockPrisma.pathToVictory.count.mockResolvedValue(2)

      const result = await service.listPathToVictories({})

      expect(result.data).toEqual(mockRecords)
      expect(result.meta).toEqual({ total: 2, offset: 0, limit: 100 })
    })

    it('applies custom pagination', async () => {
      mockPrisma.pathToVictory.findMany.mockResolvedValue([])
      mockPrisma.pathToVictory.count.mockResolvedValue(50)

      const result = await service.listPathToVictories({
        offset: 10,
        limit: 5,
      })

      expect(mockPrisma.pathToVictory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 5,
        }),
      )
      expect(result.meta).toEqual({ total: 50, offset: 10, limit: 5 })
    })

    it('applies custom sorting', async () => {
      mockPrisma.pathToVictory.findMany.mockResolvedValue([])
      mockPrisma.pathToVictory.count.mockResolvedValue(0)

      await service.listPathToVictories({
        sortBy: 'updatedAt',
        sortOrder: 'asc',
      })

      expect(mockPrisma.pathToVictory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { updatedAt: 'asc' },
        }),
      )
    })

    it('filters by userId when provided', async () => {
      mockPrisma.pathToVictory.findMany.mockResolvedValue([])
      mockPrisma.pathToVictory.count.mockResolvedValue(0)

      await service.listPathToVictories({ userId: 42 })

      expect(mockPrisma.pathToVictory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { campaign: { userId: 42 } },
        }),
      )
      expect(mockPrisma.pathToVictory.count).toHaveBeenCalledWith({
        where: { campaign: { userId: 42 } },
      })
    })

    it('does not filter by userId when not provided', async () => {
      mockPrisma.pathToVictory.findMany.mockResolvedValue([])
      mockPrisma.pathToVictory.count.mockResolvedValue(0)

      await service.listPathToVictories({})

      expect(mockPrisma.pathToVictory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      )
    })
  })
})
