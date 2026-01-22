import { ElectionsService } from '@/elections/services/elections.service'
import { PrismaService } from '@/prisma/prisma.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { UsersService } from '@/users/services/users.service'
import { GooglePlacesService } from '@/vendors/google/services/google-places.service'
import { SegmentService } from '@/vendors/segment/segment.service'
import { EVENTS } from '@/vendors/segment/segment.types'
import { SlackService } from '@/vendors/slack/services/slack.service'
import { StripeService } from '@/vendors/stripe/services/stripe.service'
import { BadRequestException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { Prisma, PrismaClient } from '@prisma/client'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { beforeEach, describe, expect, it, vi, type MockedFunction } from 'vitest'
import { CampaignPlanVersionsService } from './campaignPlanVersions.service'
import { CampaignsService } from './campaigns.service'
import { CrmCampaignsService } from './crmCampaigns.service'

describe('CampaignsService - redeemFreeTexts', () => {
  let service: CampaignsService
  let mockPrismaClient: {
    $transaction: MockedFunction<PrismaClient['$transaction']>
    campaign: {
      updateMany: MockedFunction<PrismaClient['campaign']['updateMany']>
      findUnique: MockedFunction<PrismaClient['campaign']['findUnique']>
    }
  }
  let mockAnalytics: {
    track: MockedFunction<AnalyticsService['track']>
  }

  beforeEach(async () => {
    // Mock Prisma client methods
    const mockUpdateMany = vi.fn()
    const mockFindUnique = vi.fn()
    const mockTransaction = vi.fn()

    // Store references for test assertions
    mockPrismaClient = {
      $transaction: mockTransaction as MockedFunction<
        PrismaClient['$transaction']
      >,
      campaign: {
        updateMany: mockUpdateMany as MockedFunction<
          PrismaClient['campaign']['updateMany']
        >,
        findUnique: mockFindUnique as MockedFunction<
          PrismaClient['campaign']['findUnique']
        >,
      },
    }

    // Mock Analytics - create a proper mock object
    // Ensure it has all public methods that might be called
    const mockAnalyticsInstance = {
      track: vi.fn(),
      identify: vi.fn(),
      trackProPayment: vi.fn(),
    }
    mockAnalytics = {
      track: mockAnalyticsInstance.track,
    }

    // Create mock PrismaService
    const mockPrismaService = {
      $transaction: mockTransaction,
      campaign: {
        updateMany: mockUpdateMany,
        findUnique: mockFindUnique,
      },
    }

    // Use Test.createTestingModule following NestJS best practices
    // CRITICAL: Provide SegmentService BEFORE AnalyticsService
    // Even with useValue, NestJS validates AnalyticsService class and checks its dependencies
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        // Provide PrismaService first (needed by base class via @Inject())
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        // Provide dependencies in constructor parameter order
        {
          provide: UsersService,
          useValue: {},
        },
        {
          provide: CrmCampaignsService,
          useValue: {},
        },
        // CRITICAL: Provide SegmentService BEFORE AnalyticsService
        // NestJS validates AnalyticsService class and needs SegmentService to exist
        {
          provide: SegmentService,
          useValue: {},
        },
        // Provide AnalyticsService with useValue - NestJS will use mock since SegmentService exists
        {
          provide: AnalyticsService,
          useValue: mockAnalyticsInstance,
        },
        {
          provide: CampaignPlanVersionsService,
          useValue: {},
        },
        {
          provide: StripeService,
          useValue: {},
        },
        {
          provide: GooglePlacesService,
          useValue: {},
        },
        {
          provide: ElectionsService,
          useValue: {},
        },
        {
          provide: SlackService,
          useValue: {},
        },
        // Provide CampaignsService LAST - all dependencies are now available
        CampaignsService,
      ],
    }).compile()

    service = module.get<CampaignsService>(CampaignsService)

    // Override the client property with our mock Prisma client
    // The base class uses this._prisma for the client getter
    Object.defineProperty(service, '_prisma', {
      get: () => mockPrismaClient,
      configurable: true,
    })

    // Mock logger
    const mockLogger = createMockLogger()
    Object.defineProperty(service, 'logger', {
      get: () => mockLogger,
      configurable: true,
    })

    vi.clearAllMocks()
  })

  describe('successful redemption', () => {
    it('should redeem offer and set timestamp when campaign has offer and userId exists', async () => {
      const campaignId = 123
      const userId = 456
      const mockDate = new Date('2024-01-15T10:00:00Z')
      vi.setSystemTime(mockDate)

      // Create mock functions that we can verify after transaction
      const mockUpdateMany = vi.fn().mockResolvedValue({ count: 1 })
      const mockFindUnique = vi.fn().mockResolvedValue({ userId })

      // Mock transaction callback
      mockPrismaClient.$transaction = vi.fn(
        async (callback: any, options: any) => {
          const mockTx = {
            campaign: {
              updateMany: mockUpdateMany,
              findUnique: mockFindUnique,
            },
          } as any
          const result = await callback(mockTx)
          return result
        },
      ) as MockedFunction<PrismaClient['$transaction']>

      await service.redeemFreeTexts(campaignId)

      // Verify transaction was called with Serializable isolation
      expect(mockPrismaClient.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      )

      // Verify updateMany was called with correct conditions
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: {
          id: campaignId,
          hasFreeTextsOffer: true,
        },
        data: {
          hasFreeTextsOffer: false,
          freeTextsOfferRedeemedAt: expect.any(Date),
        },
      })

      // Verify findUnique was called to get userId
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { id: campaignId },
        select: { userId: true },
      })

      // Verify analytics was tracked
      expect(mockAnalytics.track).toHaveBeenCalledWith(
        userId,
        EVENTS.Outreach.FreeTextsOfferRedeemed,
        {
          campaignId,
          redeemedAt: expect.any(String),
        },
      )

      vi.useRealTimers()
    })

    it('should redeem offer but not track analytics when userId is null', async () => {
      const campaignId = 123

      mockPrismaClient.$transaction = vi.fn(
        async (callback: any) => {
          const mockTx = {
            campaign: {
              updateMany: vi.fn().mockResolvedValue({ count: 1 }),
              findUnique: vi.fn().mockResolvedValue({ userId: null }),
            },
          }
          return await callback(mockTx)
        },
      ) as MockedFunction<PrismaClient['$transaction']>

      await service.redeemFreeTexts(campaignId)

      // Verify analytics was NOT called when userId is null
      expect(mockAnalytics.track).not.toHaveBeenCalled()
    })

    it('should redeem offer but not track analytics when campaign is not found after update', async () => {
      const campaignId = 123

      mockPrismaClient.$transaction = vi.fn(
        async (callback: any) => {
          const mockTx = {
            campaign: {
              updateMany: vi.fn().mockResolvedValue({ count: 1 }),
              findUnique: vi.fn().mockResolvedValue(null),
            },
          }
          return await callback(mockTx)
        },
      ) as MockedFunction<PrismaClient['$transaction']>

      await service.redeemFreeTexts(campaignId)

      // Verify analytics was NOT called when campaign is null
      expect(mockAnalytics.track).not.toHaveBeenCalled()
    })
  })

  describe('failure cases', () => {
    it('should throw BadRequestException when campaign does not have offer (hasFreeTextsOffer: false)', async () => {
      const campaignId = 123

      mockPrismaClient.$transaction = vi.fn(
        async (callback: any) => {
          const mockTx = {
            campaign: {
              updateMany: vi.fn().mockResolvedValue({ count: 0 }),
              findUnique: vi.fn(),
            },
          }
          return await callback(mockTx)
        },
      ) as MockedFunction<PrismaClient['$transaction']>

      await expect(service.redeemFreeTexts(campaignId)).rejects.toThrow(
        BadRequestException,
      )
      await expect(service.redeemFreeTexts(campaignId)).rejects.toThrow(
        'No free texts offer available for this campaign',
      )

      // Verify analytics was NOT called on failure
      expect(mockAnalytics.track).not.toHaveBeenCalled()
    })

    it('should throw BadRequestException when campaign does not exist', async () => {
      const campaignId = 999

      mockPrismaClient.$transaction = vi.fn(
        async (callback: any) => {
          const mockTx = {
            campaign: {
              updateMany: vi.fn().mockResolvedValue({ count: 0 }),
              findUnique: vi.fn(),
            },
          }
          return await callback(mockTx)
        },
      ) as MockedFunction<PrismaClient['$transaction']>

      await expect(service.redeemFreeTexts(campaignId)).rejects.toThrow(
        BadRequestException,
      )
    })
  })

  describe('transaction behavior', () => {
    it('should use Serializable isolation level for transaction', async () => {
      const campaignId = 123
      const userId = 456

      mockPrismaClient.$transaction = vi.fn(
        async (callback: any, options: any) => {
          const mockTx = {
            campaign: {
              updateMany: vi.fn().mockResolvedValue({ count: 1 }),
              findUnique: vi.fn().mockResolvedValue({ userId }),
            },
          }
          return await callback(mockTx)
        },
      ) as MockedFunction<PrismaClient['$transaction']>

      await service.redeemFreeTexts(campaignId)

      expect(mockPrismaClient.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      )
    })

    it('should only update campaigns with hasFreeTextsOffer: true', async () => {
      const campaignId = 123
      const userId = 456

      // Create mock functions that we can verify after transaction
      const mockUpdateMany = vi.fn().mockResolvedValue({ count: 1 })
      const mockFindUnique = vi.fn().mockResolvedValue({ userId })

      mockPrismaClient.$transaction = vi.fn(
        async (callback: any) => {
          const mockTx = {
            campaign: {
              updateMany: mockUpdateMany,
              findUnique: mockFindUnique,
            },
          } as any
          await callback(mockTx)
          return userId
        },
      ) as MockedFunction<PrismaClient['$transaction']>

      await service.redeemFreeTexts(campaignId)

      // Verify the where clause ensures only campaigns with offer are updated
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: {
          id: campaignId,
          hasFreeTextsOffer: true, // Critical: only updates if offer exists
        },
        data: {
          hasFreeTextsOffer: false,
          freeTextsOfferRedeemedAt: expect.any(Date),
        },
      })
    })
  })

  describe('data integrity', () => {
    it('should set freeTextsOfferRedeemedAt to current date when redeeming', async () => {
      const campaignId = 123
      const userId = 456
      const fixedDate = new Date('2024-01-15T10:30:00Z')
      vi.setSystemTime(fixedDate)

      // Create mock functions that we can verify after transaction
      const mockUpdateMany = vi.fn().mockResolvedValue({ count: 1 })
      const mockFindUnique = vi.fn().mockResolvedValue({ userId })

      mockPrismaClient.$transaction = vi.fn(
        async (callback: any) => {
          const mockTx = {
            campaign: {
              updateMany: mockUpdateMany,
              findUnique: mockFindUnique,
            },
          } as any
          await callback(mockTx)
          return userId
        },
      ) as MockedFunction<PrismaClient['$transaction']>

      await service.redeemFreeTexts(campaignId)

      // Verify timestamp is set (within 1 second tolerance for execution time)
      expect(mockUpdateMany).toHaveBeenCalled()
      const updateCall = mockUpdateMany.mock.calls[0]
      const redeemedAt = updateCall[0].data.freeTextsOfferRedeemedAt
      expect(redeemedAt).toBeInstanceOf(Date)
      expect(redeemedAt.getTime()).toBeCloseTo(fixedDate.getTime(), -3) // Within 1 second

      vi.useRealTimers()
    })

    it('should set both hasFreeTextsOffer to false and timestamp in same update', async () => {
      const campaignId = 123
      const userId = 456

      // Create mock functions that we can verify after transaction
      const mockUpdateMany = vi.fn().mockResolvedValue({ count: 1 })
      const mockFindUnique = vi.fn().mockResolvedValue({ userId })

      mockPrismaClient.$transaction = vi.fn(
        async (callback: any) => {
          const mockTx = {
            campaign: {
              updateMany: mockUpdateMany,
              findUnique: mockFindUnique,
            },
          } as any
          await callback(mockTx)
          return userId
        },
      ) as MockedFunction<PrismaClient['$transaction']>

      await service.redeemFreeTexts(campaignId)

      // Verify both fields are updated atomically
      expect(mockUpdateMany).toHaveBeenCalled()
      const updateCall = mockUpdateMany.mock.calls[0]
      expect(updateCall[0].data).toEqual({
        hasFreeTextsOffer: false,
        freeTextsOfferRedeemedAt: expect.any(Date),
      })
    })
  })

  describe('edge cases', () => {
    it('should handle transaction errors gracefully', async () => {
      const campaignId = 123

      mockPrismaClient.$transaction = vi.fn().mockRejectedValue(
        new Error('Database connection failed'),
      ) as MockedFunction<PrismaClient['$transaction']>

      await expect(service.redeemFreeTexts(campaignId)).rejects.toThrow(
        'Database connection failed',
      )
    })

    it('should not track analytics if transaction fails before returning userId', async () => {
      const campaignId = 123

      mockPrismaClient.$transaction = vi.fn(
        async (callback: any) => {
          const mockTx = {
            campaign: {
              updateMany: vi.fn().mockResolvedValue({ count: 1 }),
              findUnique: vi.fn().mockRejectedValue(
                new Error('Campaign not found'),
              ),
            },
          }
          return await callback(mockTx)
        },
      ) as MockedFunction<PrismaClient['$transaction']>

      await expect(service.redeemFreeTexts(campaignId)).rejects.toThrow()

      // Analytics should not be called if transaction fails
      expect(mockAnalytics.track).not.toHaveBeenCalled()
    })
  })
})
