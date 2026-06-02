import { BallotReadyService } from '@/elections/services/ballotReady.service'
import { ElectionsService } from '@/elections/services/elections.service'
import { OrganizationsService } from '@/organizations/services/organizations.service'
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
import { Campaign, Prisma, PrismaClient, User } from '@prisma/client'
import { deepmerge as deepMerge } from 'deepmerge-ts'
import { PinoLogger } from 'nestjs-pino'
import { AnalyticsService } from 'src/analytics/analytics.service'
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from 'vitest'
import { CampaignPlanVersionsService } from './campaignPlanVersions.service'
import { CampaignsService } from './campaigns.service'
import { CrmCampaignsService } from './crmCampaigns.service'
import { CampaignTasksService } from '../tasks/services/campaignTasks.service'

const GP_POSITION_ID = 'gp-position-uuid-123'
const BR_POSITION_ID = 'br-position-456'

// Null-filled defaults for fields added when fetchLiveRaceTargetMetrics
// started consuming /campaign-strategy-context. Fallback paths
// (overrideDistrictId, position-based) emit these as null; tests for those
// paths spread this into their expected result.
const EMPTY_RACE_CONTEXT_FIELDS = {
  registeredVoters: null,
  uniqueCellphones: null,
  uniqueLandlines: null,
  projectedVoterTurnout: null,
  candidates: [],
  generalElectionDate: null,
  primaryElectionDate: null,
  relevantElectionDate: null,
  officialOfficeName: null,
  officeLevel: null,
  officeType: null,
  numberOfSeats: null,
  milestones: null,
}

const mockPositionResponse = {
  id: GP_POSITION_ID,
  brPositionId: BR_POSITION_ID,
  brDatabaseId: 'br-db-1',
  state: 'CA',
  name: 'State Senate District 1',
}

const buildOrgSyncModule = async (overrides?: {
  getPositionByBallotReadyId?: MockedFunction<
    ElectionsService['getPositionByBallotReadyId']
  >
}) => {
  const mockGetPosition =
    overrides?.getPositionByBallotReadyId ??
    (vi.fn().mockResolvedValue(mockPositionResponse) as MockedFunction<
      ElectionsService['getPositionByBallotReadyId']
    >)

  const mockOrgCreate = vi.fn().mockResolvedValue({})
  const mockOrgUpdate = vi.fn().mockResolvedValue({})
  const mockOrgUpsert = vi.fn().mockResolvedValue({})
  const mockCampaignCreate = vi.fn().mockResolvedValue({ id: 1 })
  const mockCampaignUpdate = vi.fn().mockResolvedValue({ id: 1, userId: 1 })
  const mockCampaignFindFirst = vi.fn()
  const mockCampaignFindUnique = vi.fn()
  const mockQueryRaw = vi.fn().mockResolvedValue([{ nextval: BigInt(42) }])
  const mockTransaction = vi.fn(
    async (callback: Parameters<PrismaClient['$transaction']>[0]) => {
      const tx = {
        $queryRaw: mockQueryRaw,
        organization: {
          create: mockOrgCreate,
          update: mockOrgUpdate,
          upsert: mockOrgUpsert,
        },
        campaign: {
          create: mockCampaignCreate,
          update: mockCampaignUpdate,
          findFirst: mockCampaignFindFirst,
        },
        electedOffice: { findFirst: vi.fn().mockResolvedValue(null) },
      }
      return callback(
        tx as unknown as Parameters<
          Parameters<PrismaClient['$transaction']>[0]
        >[0],
      )
    },
  ) as MockedFunction<PrismaClient['$transaction']>

  const mockTrackCampaign = vi.fn()
  const mockIdentify = vi.fn()

  const mockPrismaService = {
    $transaction: mockTransaction,
    campaign: {
      findFirst: mockCampaignFindFirst,
      findUnique: mockCampaignFindUnique,
    },
  }

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      { provide: PrismaService, useValue: mockPrismaService },
      { provide: UsersService, useValue: {} },
      {
        provide: CrmCampaignsService,
        useValue: { trackCampaign: mockTrackCampaign },
      },
      { provide: SegmentService, useValue: {} },
      {
        provide: AnalyticsService,
        useValue: { track: vi.fn(), identify: mockIdentify },
      },
      { provide: CampaignPlanVersionsService, useValue: {} },
      { provide: StripeService, useValue: {} },
      { provide: GooglePlacesService, useValue: {} },
      {
        provide: ElectionsService,
        useValue: { getPositionByBallotReadyId: mockGetPosition },
      },
      {
        provide: BallotReadyService,
        useValue: { fetchMilestones: vi.fn().mockResolvedValue(null) },
      },
      { provide: OrganizationsService, useValue: {} },
      { provide: SlackService, useValue: {} },
      {
        provide: CampaignTasksService,
        useValue: { notifySlackOnProUpgrade: vi.fn() },
      },
      { provide: PinoLogger, useValue: createMockLogger() },
      CampaignsService,
    ],
  }).compile()

  const service = module.get<CampaignsService>(CampaignsService)

  Object.defineProperty(service, '_prisma', {
    get: () => mockPrismaService,
    configurable: true,
  })
  Object.defineProperty(service, 'logger', {
    get: () => createMockLogger(),
    configurable: true,
  })

  return {
    service,
    mockGetPosition,
    mockOrgCreate,
    mockOrgUpdate,
    mockOrgUpsert,
    mockCampaignCreate,
    mockCampaignFindFirst,
    mockCampaignFindUnique,
    mockCampaignUpdate,
    mockTrackCampaign,
    mockIdentify,
  }
}

describe('CampaignsService - Organization positionId sync', () => {
  describe('createForUser', () => {
    it('should create organization with resolved GP positionId when positionId is provided', async () => {
      const { service, mockGetPosition, mockOrgCreate } =
        await buildOrgSyncModule()

      vi.spyOn(service, 'findSlug').mockResolvedValue('test-slug')

      const user = { id: 1, zip: '90210' } as User

      await service.createForUser(
        user,
        { details: {} },
        { ballotReadyPositionId: BR_POSITION_ID },
      )

      expect(mockGetPosition).toHaveBeenCalledWith(BR_POSITION_ID)
      expect(mockOrgCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            positionId: GP_POSITION_ID,
          }),
        }),
      )
    })

    it('should create organization with null positionId when no positionId is provided', async () => {
      const { service, mockGetPosition, mockOrgCreate } =
        await buildOrgSyncModule()

      vi.spyOn(service, 'findSlug').mockResolvedValue('test-slug')

      const user = { id: 1, zip: '90210' } as User

      await service.createForUser(user, { details: {} })

      expect(mockGetPosition).not.toHaveBeenCalled()
      expect(mockOrgCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            positionId: null,
          }),
        }),
      )
    })

    it('persists details as deep merge of user zip and initial details', async () => {
      const { service, mockCampaignCreate } = await buildOrgSyncModule()

      vi.spyOn(service, 'findSlug').mockResolvedValue('test-slug')

      const user = { id: 1, zip: '90210' } as User
      const details = {
        state: 'CA',
        geoLocation: { lat: 37, lng: -122 },
      } as PrismaJson.CampaignDetails

      await service.createForUser(user, { details })

      const expectedDetails = deepMerge(
        { zip: user.zip } as object,
        details as object,
      ) as PrismaJson.CampaignDetails

      expect(mockCampaignCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            details: expectedDetails,
          }),
        }),
      )
    })

    describe('details json deep merge (same deepMerge as createForUser)', () => {
      it('keeps user zip when patch omits zip', () => {
        expect(deepMerge({ zip: '90210' } as object, {} as object)).toEqual({
          zip: '90210',
        })
      })

      it('lets patch override zip', () => {
        expect(
          deepMerge({ zip: '90210' } as object, { zip: '10001' } as object),
        ).toEqual({ zip: '10001' })
      })

      it('merges nested geoLocation keys instead of replacing the whole object', () => {
        const base = {
          zip: '90210',
          geoLocation: { lat: 0, lng: 0, geoHash: 'abc' },
        } as PrismaJson.CampaignDetails
        const patch = {
          geoLocation: { lat: 37.7 },
        } as PrismaJson.CampaignDetails

        expect(deepMerge(base as object, patch as object)).toEqual({
          zip: '90210',
          geoLocation: { lat: 37.7, lng: 0, geoHash: 'abc' },
        })
      })

      it('merges plain-object pastExperience when both sides are records', () => {
        const base = {
          pastExperience: { roleA: 'Mayor' },
        } as PrismaJson.CampaignDetails
        const patch = {
          pastExperience: { roleB: 'Councilor' },
        } as PrismaJson.CampaignDetails

        expect(deepMerge(base as object, patch as object)).toEqual({
          pastExperience: { roleA: 'Mayor', roleB: 'Councilor' },
        })
      })

      it('adds top-level fields from patch without dropping base zip', () => {
        const patch = {
          state: 'CA',
          city: 'Oakland',
        } as PrismaJson.CampaignDetails

        const result = deepMerge({ zip: '94601' } as object, patch as object)
        expect(result).toEqual({ zip: '94601', state: 'CA', city: 'Oakland' })
      })
    })
  })

  describe('update', () => {
    it('should delegate to campaign.update inside a transaction and track campaign', async () => {
      const {
        service,
        mockCampaignUpdate,
        mockTrackCampaign,
        mockGetPosition,
        mockOrgUpdate,
      } = await buildOrgSyncModule()

      const args = {
        where: { id: 10 } as const,
        data: {
          details: { city: 'Austin' } as PrismaJson.CampaignDetails,
        },
      }
      mockCampaignUpdate.mockResolvedValue({ id: 10, userId: 1 })

      await service.update(args)

      expect(mockCampaignUpdate).toHaveBeenCalledWith(args)
      expect(mockTrackCampaign).toHaveBeenCalledWith(10)
      expect(mockGetPosition).not.toHaveBeenCalled()
      expect(mockOrgUpdate).not.toHaveBeenCalled()
    })

    it('should call analytics.identify when isPro is set in update data', async () => {
      const { service, mockCampaignUpdate, mockIdentify } =
        await buildOrgSyncModule()

      mockCampaignUpdate.mockResolvedValue({ id: 10, userId: 42 })

      await service.update({
        where: { id: 10 },
        data: { isPro: true },
      })

      expect(mockIdentify).toHaveBeenCalledWith(42, { isPro: true })
    })
  })

  describe('updateJsonFields', () => {
    const baseCampaign = {
      id: 10,
      userId: 1,
      data: {},
      details: {},
      aiContent: {},
    }

    it('should update organization overrideDistrictId when provided', async () => {
      const { service, mockOrgUpdate, mockCampaignFindFirst } =
        await buildOrgSyncModule()

      mockCampaignFindFirst.mockResolvedValue({ ...baseCampaign })

      await service.updateJsonFields(10, {
        overrideDistrictId: 'district-uuid-123',
      })

      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { slug: 'campaign-10' },
        data: { overrideDistrictId: 'district-uuid-123' },
      })
    })

    it('should update organization with null overrideDistrictId', async () => {
      const { service, mockOrgUpdate, mockCampaignFindFirst } =
        await buildOrgSyncModule()

      mockCampaignFindFirst.mockResolvedValue({ ...baseCampaign })

      await service.updateJsonFields(10, {
        overrideDistrictId: null,
      })

      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { slug: 'campaign-10' },
        data: { overrideDistrictId: null },
      })
    })

    it('should not update organization when overrideDistrictId is not in body', async () => {
      const { service, mockOrgUpdate, mockCampaignFindFirst } =
        await buildOrgSyncModule()

      mockCampaignFindFirst.mockResolvedValue({ ...baseCampaign })

      await service.updateJsonFields(10, {
        data: { someField: 'value' },
      })

      expect(mockOrgUpdate).not.toHaveBeenCalled()
    })
  })
})

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

  // Type helper for transaction client - we only mock the methods we need
  type TransactionClient = Parameters<
    Parameters<PrismaClient['$transaction']>[0]
  >[0]
  type MockTransactionClient = {
    campaign: Partial<
      Pick<TransactionClient['campaign'], 'updateMany' | 'findUnique'>
    >
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
          provide: BallotReadyService,
          useValue: { fetchMilestones: vi.fn().mockResolvedValue(null) },
        },
        {
          provide: OrganizationsService,
          useValue: {},
        },
        {
          provide: SlackService,
          useValue: {},
        },
        {
          provide: CampaignTasksService,
          useValue: { notifySlackOnProUpgrade: vi.fn() },
        },
        // Provide CampaignsService LAST - all dependencies are now available
        { provide: PinoLogger, useValue: createMockLogger() },
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
        async (callback: Parameters<PrismaClient['$transaction']>[0]) => {
          const mockTx: MockTransactionClient = {
            campaign: {
              updateMany: mockUpdateMany,
              findUnique: mockFindUnique,
            },
          }
          const result = await callback(mockTx as TransactionClient)
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
        async (callback: Parameters<PrismaClient['$transaction']>[0]) => {
          const mockTx: MockTransactionClient = {
            campaign: {
              updateMany: vi.fn().mockResolvedValue({ count: 1 }),
              findUnique: vi.fn().mockResolvedValue({ userId: null }),
            },
          }
          return await callback(mockTx as TransactionClient)
        },
      ) as MockedFunction<PrismaClient['$transaction']>

      await service.redeemFreeTexts(campaignId)

      // Verify analytics was NOT called when userId is null
      expect(mockAnalytics.track).not.toHaveBeenCalled()
    })

    it('should redeem offer but not track analytics when campaign is not found after update', async () => {
      const campaignId = 123

      mockPrismaClient.$transaction = vi.fn(
        async (callback: Parameters<PrismaClient['$transaction']>[0]) => {
          const mockTx: MockTransactionClient = {
            campaign: {
              updateMany: vi.fn().mockResolvedValue({ count: 1 }),
              findUnique: vi.fn().mockResolvedValue(null),
            },
          }
          return await callback(mockTx as TransactionClient)
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
        async (callback: Parameters<PrismaClient['$transaction']>[0]) => {
          const mockTx: MockTransactionClient = {
            campaign: {
              updateMany: vi.fn().mockResolvedValue({ count: 0 }),
              findUnique: vi.fn(),
            },
          }
          return await callback(mockTx as TransactionClient)
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
        async (callback: Parameters<PrismaClient['$transaction']>[0]) => {
          const mockTx: MockTransactionClient = {
            campaign: {
              updateMany: vi.fn().mockResolvedValue({ count: 0 }),
              findUnique: vi.fn(),
            },
          }
          return await callback(mockTx as TransactionClient)
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
        async (callback: Parameters<PrismaClient['$transaction']>[0]) => {
          const mockTx: MockTransactionClient = {
            campaign: {
              updateMany: vi.fn().mockResolvedValue({ count: 1 }),
              findUnique: vi.fn().mockResolvedValue({ userId }),
            },
          }
          return await callback(mockTx as TransactionClient)
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
        async (callback: Parameters<PrismaClient['$transaction']>[0]) => {
          const mockTx: MockTransactionClient = {
            campaign: {
              updateMany: mockUpdateMany,
              findUnique: mockFindUnique,
            },
          }
          await callback(mockTx as TransactionClient)
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
        async (callback: Parameters<PrismaClient['$transaction']>[0]) => {
          const mockTx: MockTransactionClient = {
            campaign: {
              updateMany: mockUpdateMany,
              findUnique: mockFindUnique,
            },
          }
          await callback(mockTx as TransactionClient)
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
        async (callback: Parameters<PrismaClient['$transaction']>[0]) => {
          const mockTx: MockTransactionClient = {
            campaign: {
              updateMany: mockUpdateMany,
              findUnique: mockFindUnique,
            },
          }
          await callback(mockTx as TransactionClient)
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

      mockPrismaClient.$transaction = vi
        .fn()
        .mockRejectedValue(
          new Error('Database connection failed'),
        ) as MockedFunction<PrismaClient['$transaction']>

      await expect(service.redeemFreeTexts(campaignId)).rejects.toThrow(
        'Database connection failed',
      )
    })

    it('should not track analytics if transaction fails before returning userId', async () => {
      const campaignId = 123

      mockPrismaClient.$transaction = vi.fn(
        async (callback: Parameters<PrismaClient['$transaction']>[0]) => {
          const mockTx: MockTransactionClient = {
            campaign: {
              updateMany: vi.fn().mockResolvedValue({ count: 1 }),
              findUnique: vi
                .fn()
                .mockRejectedValue(new Error('Campaign not found')),
            },
          }
          return await callback(mockTx as TransactionClient)
        },
      ) as MockedFunction<PrismaClient['$transaction']>

      await expect(service.redeemFreeTexts(campaignId)).rejects.toThrow()

      // Analytics should not be called if transaction fails
      expect(mockAnalytics.track).not.toHaveBeenCalled()
    })
  })
})

describe('CampaignsService - fetchLiveRaceTargetMetrics', () => {
  const mockOrganizations: Partial<OrganizationsService> = {
    findUnique: vi.fn(),
  }

  const mockElections: Partial<ElectionsService> = {
    getPositionMatchedRaceTargetDetails: vi.fn(),
    buildRaceTargetDetails: vi.fn(),
    fetchFilingFeeByRaceHash: vi.fn(),
    fetchCampaignStrategyContext: vi.fn().mockResolvedValue(null),
  }

  const mockBallotReady: Partial<BallotReadyService> = {
    fetchMilestones: vi.fn().mockResolvedValue(null),
  }

  let service: CampaignsService

  beforeEach(() => {
    vi.mocked(mockBallotReady.fetchMilestones!).mockReset()
    vi.mocked(mockBallotReady.fetchMilestones!).mockResolvedValue(null)
    service = new CampaignsService(
      {} as UsersService,
      {} as CrmCampaignsService,
      {} as AnalyticsService,
      {} as CampaignPlanVersionsService,
      {} as StripeService,
      {} as GooglePlacesService,
      mockElections as ElectionsService,
      mockBallotReady as BallotReadyService,
      mockOrganizations as OrganizationsService,
      {} as SlackService,
      { notifySlackOnProUpgrade: vi.fn() } as unknown as CampaignTasksService,
    )
  })

  const baseCampaign = {
    id: 1,
    organizationSlug: 'org-1',
    details: { electionDate: '2026-11-03' },
  } as unknown as Campaign

  it('should return live metrics from election-api', async () => {
    vi.mocked(mockOrganizations.findUnique!).mockResolvedValue({
      positionId: 'pos-123',
    } as Awaited<ReturnType<OrganizationsService['findUnique']>>)

    vi.mocked(
      mockElections.getPositionMatchedRaceTargetDetails!,
    ).mockResolvedValue({
      district: {
        id: 'd-1',
        state: 'CA',
        L2DistrictType: 'State_Senate',
        L2DistrictName: 'STATE SENATE 001',
        projectedTurnout: null,
      },
      projectedTurnout: 10000,
      winNumber: 5001,
      voterContactGoal: 25005,
      filingFee: 250,
      filingRequirementsText: 'Filing fee is $250.',
    })

    const result = await service.fetchLiveRaceTargetMetrics(baseCampaign)

    expect(result).toEqual({
      projectedTurnout: 10000,
      winNumber: 5001,
      voterContactGoal: 25005,
      filingFee: 250,
      filingRequirementsText: 'Filing fee is $250.',
      ...EMPTY_RACE_CONTEXT_FIELDS,
    })
    expect(
      mockElections.getPositionMatchedRaceTargetDetails,
    ).toHaveBeenCalledWith({
      positionId: 'pos-123',
      electionDate: '2026-11-03',
      includeTurnout: true,
      campaignId: 1,
      officeName: undefined,
    })
  })

  it('should return null when campaign has no organizationSlug', async () => {
    const campaign = {
      ...baseCampaign,
      organizationSlug: null,
    } as unknown as Campaign

    const result = await service.fetchLiveRaceTargetMetrics(campaign)

    expect(result).toBeNull()
  })

  it('should return null when organization has no positionId and no overrideDistrictId', async () => {
    vi.mocked(mockOrganizations.findUnique!).mockResolvedValue({
      positionId: null,
      overrideDistrictId: null,
    } as Awaited<ReturnType<OrganizationsService['findUnique']>>)

    const result = await service.fetchLiveRaceTargetMetrics(baseCampaign)

    expect(result).toBeNull()
  })

  it('should return null when campaign has no electionDate', async () => {
    const campaign = {
      ...baseCampaign,
      details: {},
    } as unknown as Campaign

    vi.mocked(mockOrganizations.findUnique!).mockResolvedValue({
      positionId: 'pos-123',
    } as Awaited<ReturnType<OrganizationsService['findUnique']>>)

    const result = await service.fetchLiveRaceTargetMetrics(campaign)

    expect(result).toBeNull()
  })

  it('should return null when election-api call fails', async () => {
    vi.mocked(mockOrganizations.findUnique!).mockResolvedValue({
      positionId: 'pos-123',
    } as Awaited<ReturnType<OrganizationsService['findUnique']>>)
    vi.mocked(
      mockElections.getPositionMatchedRaceTargetDetails!,
    ).mockRejectedValue(new Error('election-api down'))

    const result = await service.fetchLiveRaceTargetMetrics(baseCampaign)

    expect(result).toBeNull()
  })

  it('should return null when turnout is sentinel -1', async () => {
    vi.mocked(mockOrganizations.findUnique!).mockResolvedValue({
      positionId: 'pos-123',
    } as Awaited<ReturnType<OrganizationsService['findUnique']>>)
    vi.mocked(
      mockElections.getPositionMatchedRaceTargetDetails!,
    ).mockResolvedValue({
      district: {
        id: 'd-1',
        state: 'CA',
        L2DistrictType: 'State_Senate',
        L2DistrictName: 'STATE SENATE 001',
        projectedTurnout: null,
      },
      projectedTurnout: -1,
      winNumber: -1,
      voterContactGoal: -1,
      filingFee: null,
      filingRequirementsText: null,
    })

    const result = await service.fetchLiveRaceTargetMetrics(baseCampaign)

    expect(result).toBeNull()
  })

  it('should use overrideDistrictId when present', async () => {
    vi.mocked(mockOrganizations.findUnique!).mockResolvedValue({
      positionId: 'pos-123',
      overrideDistrictId: 'override-district-uuid',
    } as Awaited<ReturnType<OrganizationsService['findUnique']>>)

    vi.mocked(mockElections.buildRaceTargetDetails!).mockResolvedValue({
      projectedTurnout: 6000,
      winNumber: 3001,
      voterContactGoal: 15005,
    })

    const result = await service.fetchLiveRaceTargetMetrics(baseCampaign)

    expect(result).toEqual({
      projectedTurnout: 6000,
      winNumber: 3001,
      voterContactGoal: 15005,
      filingFee: null,
      filingRequirementsText: null,
      ...EMPTY_RACE_CONTEXT_FIELDS,
    })
    expect(mockElections.buildRaceTargetDetails).toHaveBeenCalledWith({
      districtId: 'override-district-uuid',
      electionDate: '2026-11-03',
    })
    expect(
      mockElections.getPositionMatchedRaceTargetDetails,
    ).not.toHaveBeenCalled()
  })

  it('should use overrideDistrictId even without positionId', async () => {
    vi.mocked(mockOrganizations.findUnique!).mockResolvedValue({
      positionId: null,
      overrideDistrictId: 'override-district-uuid',
    } as Awaited<ReturnType<OrganizationsService['findUnique']>>)

    vi.mocked(mockElections.buildRaceTargetDetails!).mockResolvedValue({
      projectedTurnout: 4000,
      winNumber: 2001,
      voterContactGoal: 10005,
    })

    const result = await service.fetchLiveRaceTargetMetrics(baseCampaign)

    expect(result).toEqual({
      projectedTurnout: 4000,
      winNumber: 2001,
      voterContactGoal: 10005,
      filingFee: null,
      filingRequirementsText: null,
      ...EMPTY_RACE_CONTEXT_FIELDS,
    })
  })

  it('should return null when overrideDistrictId lookup fails', async () => {
    vi.mocked(mockOrganizations.findUnique!).mockResolvedValue({
      positionId: null,
      overrideDistrictId: 'bad-district-uuid',
    } as Awaited<ReturnType<OrganizationsService['findUnique']>>)

    vi.mocked(mockElections.buildRaceTargetDetails!).mockRejectedValue(
      new Error('election-api down'),
    )

    const result = await service.fetchLiveRaceTargetMetrics(baseCampaign)

    expect(result).toBeNull()
  })

  describe('details.raceId race-hash filing fee path', () => {
    const campaignWithRaceId = {
      ...baseCampaign,
      details: { electionDate: '2026-11-03', raceId: 'Z2lk-hash' },
    } as unknown as Campaign

    beforeEach(() => {
      vi.mocked(mockElections.fetchFilingFeeByRaceHash!).mockReset()
      vi.mocked(mockOrganizations.findUnique!).mockResolvedValue({
        positionId: 'pos-123',
      } as Awaited<ReturnType<OrganizationsService['findUnique']>>)
      vi.mocked(
        mockElections.getPositionMatchedRaceTargetDetails!,
      ).mockResolvedValue({
        district: {
          id: 'd-1',
          state: 'CA',
          L2DistrictType: 'State_Senate',
          L2DistrictName: 'STATE SENATE 001',
          projectedTurnout: null,
        },
        projectedTurnout: 10000,
        winNumber: 5001,
        voterContactGoal: 25005,
        filingFee: 250,
        filingRequirementsText: 'Position-side text.',
      })
    })

    it('prefers race-hash result over position-side filingFee', async () => {
      vi.mocked(mockElections.fetchFilingFeeByRaceHash!).mockResolvedValue({
        filingFee: 75,
        filingRequirementsText: 'BR-hash text.',
        extractionSource: 'direct_dollar',
      })

      const result =
        await service.fetchLiveRaceTargetMetrics(campaignWithRaceId)

      expect(mockElections.fetchFilingFeeByRaceHash).toHaveBeenCalledWith(
        'Z2lk-hash',
      )
      expect(result).toEqual({
        projectedTurnout: 10000,
        winNumber: 5001,
        voterContactGoal: 25005,
        filingFee: 75,
        filingRequirementsText: 'BR-hash text.',
        ...EMPTY_RACE_CONTEXT_FIELDS,
      })
    })

    it('keeps null filingFee from race-hash when BR has no fee data (does not fall back)', async () => {
      // Race-hash lookup found the Race row but couldn't extract a clean fee
      // (e.g. multi_value or no_match). The raw text + null fee are the
      // authoritative answer — we must NOT silently fall back to a stale
      // position-side fee.
      vi.mocked(mockElections.fetchFilingFeeByRaceHash!).mockResolvedValue({
        filingFee: null,
        filingRequirementsText: 'Fee varies; see BR.',
        extractionSource: 'multi_value',
      })

      const result =
        await service.fetchLiveRaceTargetMetrics(campaignWithRaceId)

      expect(result).toEqual({
        projectedTurnout: 10000,
        winNumber: 5001,
        voterContactGoal: 25005,
        filingFee: null,
        filingRequirementsText: 'Fee varies; see BR.',
        ...EMPTY_RACE_CONTEXT_FIELDS,
      })
    })

    it('falls back to position-side filingFee when race-hash returns null', async () => {
      // `fetchFilingFeeByRaceHash` returns null when the underlying election-api
      // call failed (e.g. 5xx, network) — it catches internally and never
      // rejects. Distinct from the "found, no fee" case above, which returns
      // { filingFee: null, ...} (an object).
      vi.mocked(mockElections.fetchFilingFeeByRaceHash!).mockResolvedValue(null)

      const result =
        await service.fetchLiveRaceTargetMetrics(campaignWithRaceId)

      expect(result).toEqual({
        projectedTurnout: 10000,
        winNumber: 5001,
        voterContactGoal: 25005,
        filingFee: 250,
        filingRequirementsText: 'Position-side text.',
        ...EMPTY_RACE_CONTEXT_FIELDS,
      })
    })

    it('uses race-hash filingFee on the overrideDistrictId branch', async () => {
      vi.mocked(mockOrganizations.findUnique!).mockResolvedValue({
        positionId: null,
        overrideDistrictId: 'override-district-uuid',
      } as Awaited<ReturnType<OrganizationsService['findUnique']>>)
      vi.mocked(mockElections.buildRaceTargetDetails!).mockResolvedValue({
        projectedTurnout: 4000,
        winNumber: 2001,
        voterContactGoal: 10005,
      })
      vi.mocked(mockElections.fetchFilingFeeByRaceHash!).mockResolvedValue({
        filingFee: 50,
        filingRequirementsText: 'BR-hash text.',
        extractionSource: 'direct_dollar',
      })

      const result =
        await service.fetchLiveRaceTargetMetrics(campaignWithRaceId)

      expect(result).toEqual({
        projectedTurnout: 4000,
        winNumber: 2001,
        voterContactGoal: 10005,
        filingFee: 50,
        filingRequirementsText: 'BR-hash text.',
        ...EMPTY_RACE_CONTEXT_FIELDS,
      })
    })

    it('skips race-hash call when details.raceId is missing', async () => {
      const noRaceId = {
        ...baseCampaign,
        details: { electionDate: '2026-11-03' },
      } as unknown as Campaign

      await service.fetchLiveRaceTargetMetrics(noRaceId)

      expect(mockElections.fetchFilingFeeByRaceHash).not.toHaveBeenCalled()
    })
  })

  describe('campaign-strategy-context path (new unified source)', () => {
    const campaignWithRaceId = {
      ...baseCampaign,
      details: { electionDate: '2026-11-03', raceId: 'Z2lk-hash' },
    } as unknown as Campaign

    beforeEach(() => {
      vi.mocked(mockElections.fetchCampaignStrategyContext!).mockReset()
      vi.mocked(mockElections.fetchFilingFeeByRaceHash!).mockReset()
      vi.mocked(mockOrganizations.findUnique!).mockResolvedValue({
        positionId: 'pos-123',
      } as Awaited<ReturnType<OrganizationsService['findUnique']>>)
    })

    it('maps context response onto RaceTargetMetrics when context returns data', async () => {
      vi.mocked(mockElections.fetchCampaignStrategyContext!).mockResolvedValue({
        candidate_count: 3,
        candidate_office: 'City Council',
        candidates: [
          {
            gp_candidate_id: 'gp-1',
            first_name: 'Ada',
            last_name: 'Lovelace',
            full_name: 'Ada Lovelace',
            email: null,
            website_url: null,
            party: 'Independent',
            is_incumbent: true,
          },
        ],
        civics_win_number: 600,
        contacts_needed_estimate: 3000,
        general_election_date: '2026-11-03',
        number_of_seats: 1,
        office_level: 'CITY',
        office_type: 'COUNCIL',
        official_office_name: 'City Council Seat 5',
        primary_election_date: '2026-08-04',
        projected_turnout: 1200,
        projected_voter_turnout: 1200,
        registered_voters: 5500,
        unique_cellphones: 3300,
        unique_landlines: 1800,
        relevant_election_date: '2026-11-03',
        state: 'CA',
        win_number_effective: 600,
        win_number_estimate: 601,
      })
      vi.mocked(mockElections.fetchFilingFeeByRaceHash!).mockResolvedValue({
        filingFee: 100,
        filingRequirementsText: 'Filing fee: $100.',
        extractionSource: 'direct_dollar',
      })
      vi.mocked(mockBallotReady.fetchMilestones!).mockResolvedValue({
        voter_registration: { start: '2026-06-01', end: '2026-10-19' },
        early_voting: { start: '2026-10-20', end: '2026-11-02' },
        request_ballot: { start: '2026-09-01', end: '2026-10-27' },
      })

      const result =
        await service.fetchLiveRaceTargetMetrics(campaignWithRaceId)

      expect(result).toEqual({
        winNumber: 600,
        voterContactGoal: 3000,
        projectedTurnout: 1200,
        filingFee: 100,
        filingRequirementsText: 'Filing fee: $100.',
        registeredVoters: 5500,
        uniqueCellphones: 3300,
        uniqueLandlines: 1800,
        projectedVoterTurnout: 1200,
        candidates: [
          {
            gpCandidateId: 'gp-1',
            firstName: 'Ada',
            lastName: 'Lovelace',
            fullName: 'Ada Lovelace',
            email: null,
            websiteUrl: null,
            party: 'Independent',
            isIncumbent: true,
          },
        ],
        generalElectionDate: '2026-11-03',
        primaryElectionDate: '2026-08-04',
        relevantElectionDate: '2026-11-03',
        officialOfficeName: 'City Council Seat 5',
        officeLevel: 'CITY',
        officeType: 'COUNCIL',
        numberOfSeats: 1,
        milestones: {
          voter_registration: { start: '2026-06-01', end: '2026-10-19' },
          early_voting: { start: '2026-10-20', end: '2026-11-02' },
          request_ballot: { start: '2026-09-01', end: '2026-10-27' },
        },
      })

      // The legacy position-based path must not fire when context wins.
      expect(
        mockElections.getPositionMatchedRaceTargetDetails,
      ).not.toHaveBeenCalled()
    })

    it('falls back to position-based path when context returns null', async () => {
      vi.mocked(mockElections.fetchCampaignStrategyContext!).mockResolvedValue(
        null,
      )
      vi.mocked(mockElections.fetchFilingFeeByRaceHash!).mockResolvedValue(null)
      vi.mocked(
        mockElections.getPositionMatchedRaceTargetDetails!,
      ).mockResolvedValue({
        district: {
          id: 'd-1',
          state: 'CA',
          L2DistrictType: 'State_Senate',
          L2DistrictName: 'STATE SENATE 001',
          projectedTurnout: null,
        },
        projectedTurnout: 8000,
        winNumber: 4001,
        voterContactGoal: 20005,
        filingFee: null,
        filingRequirementsText: null,
      })

      const result =
        await service.fetchLiveRaceTargetMetrics(campaignWithRaceId)

      expect(result).toEqual({
        projectedTurnout: 8000,
        winNumber: 4001,
        voterContactGoal: 20005,
        filingFee: null,
        filingRequirementsText: null,
        ...EMPTY_RACE_CONTEXT_FIELDS,
      })
      expect(
        mockElections.getPositionMatchedRaceTargetDetails,
      ).toHaveBeenCalled()
    })

    it('threads milestones through the position-based fallback path', async () => {
      // The fan-out fires fetchMilestones whenever raceId is present,
      // independent of whether context resolves. Without this assertion,
      // a regression that hardcoded `milestones: null` on the fallback
      // branch in campaigns.service.ts would still pass every other
      // test (mockBallotReady defaults to null + EMPTY_RACE_CONTEXT_FIELDS
      // asserts null).
      vi.mocked(mockElections.fetchCampaignStrategyContext!).mockResolvedValue(
        null,
      )
      vi.mocked(mockElections.fetchFilingFeeByRaceHash!).mockResolvedValue(null)
      vi.mocked(
        mockElections.getPositionMatchedRaceTargetDetails!,
      ).mockResolvedValue({
        district: {
          id: 'd-1',
          state: 'CA',
          L2DistrictType: 'State_Senate',
          L2DistrictName: 'STATE SENATE 001',
          projectedTurnout: null,
        },
        projectedTurnout: 8000,
        winNumber: 4001,
        voterContactGoal: 20005,
        filingFee: null,
        filingRequirementsText: null,
      })
      vi.mocked(mockBallotReady.fetchMilestones!).mockResolvedValue({
        voter_registration: { start: '2026-06-01', end: '2026-10-19' },
        early_voting: { start: '2026-10-20', end: '2026-11-02' },
        request_ballot: { start: '2026-09-01', end: '2026-10-27' },
      })

      const result =
        await service.fetchLiveRaceTargetMetrics(campaignWithRaceId)

      expect(mockBallotReady.fetchMilestones).toHaveBeenCalledWith('Z2lk-hash')
      expect(result?.milestones).toEqual({
        voter_registration: { start: '2026-06-01', end: '2026-10-19' },
        early_voting: { start: '2026-10-20', end: '2026-11-02' },
        request_ballot: { start: '2026-09-01', end: '2026-10-27' },
      })
    })

    it('returns the context shape even when no org positionId / overrideDistrictId is set (raceId is enough)', async () => {
      vi.mocked(mockOrganizations.findUnique!).mockResolvedValue({
        positionId: null,
        overrideDistrictId: null,
      } as Awaited<ReturnType<OrganizationsService['findUnique']>>)
      vi.mocked(mockElections.fetchCampaignStrategyContext!).mockResolvedValue({
        candidate_count: 1,
        candidate_office: null,
        candidates: [],
        civics_win_number: null,
        contacts_needed_estimate: 500,
        general_election_date: null,
        number_of_seats: null,
        office_level: null,
        office_type: null,
        official_office_name: null,
        primary_election_date: null,
        projected_turnout: 200,
        projected_voter_turnout: 200,
        registered_voters: 900,
        unique_cellphones: 500,
        unique_landlines: 300,
        relevant_election_date: '2026-11-03',
        state: 'CA',
        win_number_effective: 100,
        win_number_estimate: 101,
      })
      vi.mocked(mockElections.fetchFilingFeeByRaceHash!).mockResolvedValue(null)

      const result =
        await service.fetchLiveRaceTargetMetrics(campaignWithRaceId)

      expect(result?.winNumber).toBe(100)
      expect(result?.voterContactGoal).toBe(500)
      expect(result?.projectedTurnout).toBe(200)
      expect(result?.registeredVoters).toBe(900)
    })
  })
})
