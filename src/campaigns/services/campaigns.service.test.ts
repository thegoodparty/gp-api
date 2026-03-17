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
import { Prisma, PrismaClient, User } from '@prisma/client'
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

const GP_POSITION_ID = 'gp-position-uuid-123'
const BR_POSITION_ID = 'br-position-456'

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
    async (
      callback: Parameters<PrismaClient['$transaction']>[0],
      _options?: Parameters<PrismaClient['$transaction']>[1],
    ) => {
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
        pathToVictory: { update: vi.fn(), create: vi.fn() },
      }
      return callback(
        tx as unknown as Parameters<
          Parameters<PrismaClient['$transaction']>[0]
        >[0],
      )
    },
  ) as MockedFunction<PrismaClient['$transaction']>

  const mockTrackCampaign = vi.fn()

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
        useValue: { track: vi.fn(), identify: vi.fn() },
      },
      { provide: CampaignPlanVersionsService, useValue: {} },
      { provide: StripeService, useValue: {} },
      { provide: GooglePlacesService, useValue: {} },
      {
        provide: ElectionsService,
        useValue: { getPositionByBallotReadyId: mockGetPosition },
      },
      { provide: SlackService, useValue: {} },
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
    mockCampaignFindFirst,
    mockCampaignFindUnique,
    mockCampaignUpdate,
  }
}

describe('CampaignsService - Organization positionId sync', () => {
  describe('createForUser', () => {
    it('should create organization with resolved GP positionId when positionId is provided', async () => {
      const { service, mockGetPosition, mockOrgCreate } =
        await buildOrgSyncModule()

      vi.spyOn(service, 'findSlug').mockResolvedValue('test-slug')

      const user = { id: 1, zip: '90210' } as User

      await service.createForUser(user, {
        details: { positionId: BR_POSITION_ID },
      })

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
  })

  describe('update', () => {
    it('should update organization with resolved GP positionId when positionId is in update data', async () => {
      const {
        service,
        mockGetPosition,
        mockOrgUpdate,
        mockCampaignFindUnique,
      } = await buildOrgSyncModule()

      mockCampaignFindUnique.mockResolvedValue({
        id: 10,
        userId: 1,
        details: {},
      })

      await service.update({
        where: { id: 10 },
        data: { details: { positionId: BR_POSITION_ID } },
      })

      expect(mockGetPosition).toHaveBeenCalledWith(BR_POSITION_ID)
      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { slug: 'campaign-10' },
        data: {
          positionId: GP_POSITION_ID,
          customPositionName: null,
          overrideDistrictId: null,
        },
      })
    })

    it('should update organization positionId from existing campaign when not in update data', async () => {
      const {
        service,
        mockGetPosition,
        mockOrgUpdate,
        mockCampaignFindUnique,
      } = await buildOrgSyncModule()

      mockCampaignFindUnique.mockResolvedValue({
        id: 10,
        userId: 1,
        details: { positionId: BR_POSITION_ID },
      })

      await service.update({
        where: { id: 10 },
        data: { details: { office: 'Mayor' } },
      })

      expect(mockGetPosition).toHaveBeenCalledWith(BR_POSITION_ID)
      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { slug: 'campaign-10' },
        data: {
          positionId: GP_POSITION_ID,
          customPositionName: null,
          overrideDistrictId: null,
        },
      })
    })

    it('should update organization with null positionId when no positionId exists', async () => {
      const {
        service,
        mockGetPosition,
        mockOrgUpdate,
        mockCampaignFindUnique,
      } = await buildOrgSyncModule()

      mockCampaignFindUnique.mockResolvedValue({
        id: 10,
        userId: 1,
        details: {},
      })

      await service.update({
        where: { id: 10 },
        data: { details: { office: 'Mayor' } },
      })

      expect(mockGetPosition).not.toHaveBeenCalled()
      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { slug: 'campaign-10' },
        data: {
          positionId: null,
          customPositionName: 'Mayor',
          overrideDistrictId: null,
        },
      })
    })

    it('should clear positionId when explicitly set to null', async () => {
      const {
        service,
        mockGetPosition,
        mockOrgUpdate,
        mockCampaignFindUnique,
      } = await buildOrgSyncModule()

      mockCampaignFindUnique.mockResolvedValue({
        id: 10,
        userId: 1,
        details: { positionId: BR_POSITION_ID },
      })

      await service.update({
        where: { id: 10 },
        data: { details: { positionId: null } },
      })

      expect(mockGetPosition).not.toHaveBeenCalled()
      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { slug: 'campaign-10' },
        data: {
          positionId: null,
          customPositionName: null,
          overrideDistrictId: null,
        },
      })
    })

    it('should skip org sync when details is not in update data', async () => {
      const {
        service,
        mockGetPosition,
        mockOrgUpdate,
        mockCampaignFindUnique,
      } = await buildOrgSyncModule()

      await service.update({
        where: { id: 10 },
        data: { isPro: true },
      })

      expect(mockCampaignFindUnique).not.toHaveBeenCalled()
      expect(mockGetPosition).not.toHaveBeenCalled()
      expect(mockOrgUpdate).not.toHaveBeenCalled()
    })
  })

  describe('updateJsonFields', () => {
    const baseCampaign = {
      id: 10,
      userId: 1,
      data: {},
      details: {},
      aiContent: {},
      pathToVictory: null,
    }

    it('should update organization with resolved GP positionId when positionId is in body details', async () => {
      const { service, mockGetPosition, mockOrgUpdate, mockCampaignFindFirst } =
        await buildOrgSyncModule()

      mockCampaignFindFirst
        .mockResolvedValueOnce({ details: {} })
        .mockResolvedValueOnce({ ...baseCampaign })
        .mockResolvedValueOnce({ ...baseCampaign })

      await service.updateJsonFields(10, {
        details: { positionId: BR_POSITION_ID },
      })

      expect(mockGetPosition).toHaveBeenCalledWith(BR_POSITION_ID)
      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { slug: 'campaign-10' },
        data: {
          positionId: GP_POSITION_ID,
          customPositionName: null,
          overrideDistrictId: null,
        },
      })
    })

    it('should update organization positionId from existing campaign when not in body', async () => {
      const { service, mockGetPosition, mockOrgUpdate, mockCampaignFindFirst } =
        await buildOrgSyncModule()

      mockCampaignFindFirst
        .mockResolvedValueOnce({ details: { positionId: BR_POSITION_ID } })
        .mockResolvedValueOnce({ ...baseCampaign })
        .mockResolvedValueOnce({ ...baseCampaign })

      await service.updateJsonFields(10, {
        details: { office: 'Mayor' },
      })

      expect(mockGetPosition).toHaveBeenCalledWith(BR_POSITION_ID)
      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { slug: 'campaign-10' },
        data: {
          positionId: GP_POSITION_ID,
          customPositionName: null,
          overrideDistrictId: null,
        },
      })
    })

    it('should update organization with null positionId when no positionId exists', async () => {
      const { service, mockGetPosition, mockOrgUpdate, mockCampaignFindFirst } =
        await buildOrgSyncModule()

      mockCampaignFindFirst
        .mockResolvedValueOnce({ details: {} })
        .mockResolvedValueOnce({ ...baseCampaign })
        .mockResolvedValueOnce({ ...baseCampaign })

      await service.updateJsonFields(10, {
        details: { office: 'Mayor' },
      })

      expect(mockGetPosition).not.toHaveBeenCalled()
      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { slug: 'campaign-10' },
        data: {
          positionId: null,
          customPositionName: 'Mayor',
          overrideDistrictId: null,
        },
      })
    })

    it('should clear positionId when explicitly set to null', async () => {
      const { service, mockGetPosition, mockOrgUpdate, mockCampaignFindFirst } =
        await buildOrgSyncModule()

      mockCampaignFindFirst
        .mockResolvedValueOnce({ details: { positionId: BR_POSITION_ID } })
        .mockResolvedValueOnce({ ...baseCampaign })
        .mockResolvedValueOnce({ ...baseCampaign })

      await service.updateJsonFields(10, {
        details: { positionId: null },
      })

      expect(mockGetPosition).not.toHaveBeenCalled()
      expect(mockOrgUpdate).toHaveBeenCalledWith({
        where: { slug: 'campaign-10' },
        data: {
          positionId: null,
          customPositionName: null,
          overrideDistrictId: null,
        },
      })
    })

    it('should skip org sync when details is not in body', async () => {
      const { service, mockGetPosition, mockOrgUpdate, mockCampaignFindFirst } =
        await buildOrgSyncModule()

      mockCampaignFindFirst
        .mockResolvedValueOnce({ ...baseCampaign })
        .mockResolvedValueOnce({ ...baseCampaign })

      await service.updateJsonFields(10, {
        data: { someField: 'value' },
      })

      expect(mockGetPosition).not.toHaveBeenCalled()
      expect(mockOrgUpdate).not.toHaveBeenCalled()
    })

    it('should update organization overrideDistrictId when provided', async () => {
      const { service, mockOrgUpdate, mockCampaignFindFirst } =
        await buildOrgSyncModule()

      mockCampaignFindFirst
        .mockResolvedValueOnce({ ...baseCampaign })
        .mockResolvedValueOnce({ ...baseCampaign })

      await service.updateJsonFields(10, {
        pathToVictory: { electionType: 'State Senate' },
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

      mockCampaignFindFirst
        .mockResolvedValueOnce({ ...baseCampaign })
        .mockResolvedValueOnce({ ...baseCampaign })

      await service.updateJsonFields(10, {
        pathToVictory: { electionType: 'State Senate' },
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

      mockCampaignFindFirst
        .mockResolvedValueOnce({ ...baseCampaign })
        .mockResolvedValueOnce({ ...baseCampaign })

      await service.updateJsonFields(10, {
        pathToVictory: { electionType: 'State Senate' },
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
          provide: SlackService,
          useValue: {},
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
        async (
          callback: Parameters<PrismaClient['$transaction']>[0],
          _options?: Parameters<PrismaClient['$transaction']>[1],
        ) => {
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
