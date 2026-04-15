import { OrganizationsService } from '@/organizations/services/organizations.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { CampaignStatus } from '@goodparty_org/contracts'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import {
  Campaign,
  Organization,
  PathToVictory,
  User,
  UserRole,
} from '@prisma/client'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { ElectionsService } from 'src/elections/services/elections.service'
import { RaceTargetDetailsResult } from 'src/elections/types/elections.types'
import { P2VStatus } from 'src/elections/types/pathToVictory.types'
import { P2VSource } from 'src/pathToVictory/types/pathToVictory.types'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CampaignsController } from './campaigns.controller'
import { CreateCampaignSchema } from './schemas/updateCampaign.schema'
import { CampaignPlanVersionsService } from './services/campaignPlanVersions.service'
import { CampaignsService } from './services/campaigns.service'
import { CampaignWith } from './campaigns.types'

function mockRaceTargetResult(
  overrides: Partial<RaceTargetDetailsResult> = {},
): RaceTargetDetailsResult {
  return {
    projectedTurnout: 0,
    winNumber: 0,
    voterContactGoal: 0,
    source: 'test',
    p2vStatus: 'Complete',
    p2vCompleteDate: '2025-01-01',
    ...overrides,
  }
}

const CREATED_AT = '2025-01-01'

const userDefaults = {
  createdAt: new Date(CREATED_AT),
  updatedAt: new Date(CREATED_AT),
  firstName: 'Test',
  lastName: 'User',
  name: 'Test User',
  avatar: null,
  password: null,
  hasPassword: false,
  email: 'test@example.com',
  phone: '5555555555',
  zip: '12345',
  metaData: null,
  passwordResetToken: null,
}

const mockUser: User = {
  ...userDefaults,
  id: 1,
  roles: [UserRole.candidate],
}

const mockAdminUser: User = {
  ...userDefaults,
  id: 2,
  roles: [UserRole.admin],
}

const mockSalesUser: User = {
  ...userDefaults,
  id: 3,
  roles: [UserRole.sales],
}

const campaignDefaults = {
  createdAt: new Date(CREATED_AT),
  updatedAt: new Date(CREATED_AT),
  isVerified: false,
  isPro: false,
  isDemo: false,
  didWin: null,
  dateVerified: null,
  tier: null,
  formattedAddress: null,
  placeId: null,
  aiContent: {},
  vendorTsData: {},
  canDownloadFederal: false,
  completedTaskIds: [],
  hasFreeTextsOffer: false,
  freeTextsOfferRedeemedAt: null,
}

const mockCampaign: Campaign = {
  ...campaignDefaults,
  id: 100,
  organizationSlug: 'campaign-100',
  slug: 'john-doe',
  userId: 1,
  isActive: true,
  data: { name: 'Real Campaign' },
  details: {
    electionDate: '2025-11-04',
    state: 'CA',
  } as unknown as Campaign['details'],
}

const mockP2V: PathToVictory = {
  id: 10,
  createdAt: new Date(CREATED_AT),
  updatedAt: new Date(CREATED_AT),
  campaignId: 100,
  data: { p2vStatus: P2VStatus.waiting },
}

const mockCampaignWithP2V = {
  ...mockCampaign,
  pathToVictory: null as PathToVictory | null,
}

const OVERRIDE_SLUG = 'other'

const mockOtherCampaign: Campaign = {
  ...mockCampaign,
  id: 200,
  slug: OVERRIDE_SLUG,
}

const mockOtherCampaignWithP2V = {
  ...mockOtherCampaign,
  pathToVictory: null as PathToVictory | null,
}

const mockRaceTargetDetails = {
  district: {
    id: 'd-1',
    L2DistrictType: 'City Council',
    L2DistrictName: 'Ward 3',
    projectedTurnout: null,
  },
  winNumber: 2000,
  voterContactGoal: 2500,
  projectedTurnout: 4000,
}

describe('CampaignsController', () => {
  let controller: CampaignsController
  let campaignsService: CampaignsService
  let planVersionsService: CampaignPlanVersionsService
  let slackService: SlackService
  let electionsService: ElectionsService
  let organizationsService: OrganizationsService
  let analyticsService: AnalyticsService

  beforeEach(() => {
    const campaignsServiceMock: Partial<CampaignsService> = {
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      findByUserId: vi.fn(),
      listCampaigns: vi.fn(),
      getStatus: vi.fn(),
      createForUser: vi.fn(),
      updateJsonFields: vi.fn(),
      launch: vi.fn(),
      fetchLiveRaceTargetMetrics: vi.fn().mockResolvedValue(null),
    }
    campaignsService = campaignsServiceMock as CampaignsService

    const planVersionsServiceMock: Partial<CampaignPlanVersionsService> = {
      findByCampaignId: vi.fn(),
    }
    planVersionsService = planVersionsServiceMock as CampaignPlanVersionsService

    const slackServiceMock: Partial<SlackService> = {
      errorMessage: vi.fn(),
    }
    slackService = slackServiceMock as SlackService

    const electionsServiceMock: Partial<ElectionsService> = {
      buildRaceTargetDetails: vi.fn(),
      getPositionMatchedRaceTargetDetails: vi.fn(),
      getDistrictId: vi.fn().mockResolvedValue(null),
    }
    electionsService = electionsServiceMock as ElectionsService

    const organizationsServiceMock: Partial<OrganizationsService> = {
      resolveOverrideDistrictId: vi.fn().mockResolvedValue(null),
      findUnique: vi
        .fn()
        .mockResolvedValue({ positionId: 'pos-1', customPositionName: null }),
      resolveBallotReadyPositionId: vi.fn().mockResolvedValue('br-pos-1'),
      resolvePositionContext: vi.fn().mockResolvedValue({
        ballotReadyPositionId: 'br-pos-1',
        positionName: 'Mayor',
      }),
    }
    organizationsService = organizationsServiceMock as OrganizationsService

    const analyticsServiceMock: Partial<AnalyticsService> = {
      identify: vi.fn(),
    }
    analyticsService = analyticsServiceMock as AnalyticsService

    controller = new CampaignsController(
      campaignsService,
      planVersionsService,
      slackService,
      electionsService,
      organizationsService,
      analyticsService,
      createMockLogger(),
    )
  })

  describe('findAll', () => {
    it('passes empty where when no filters provided', () => {
      vi.spyOn(campaignsService, 'findMany').mockResolvedValue([])

      controller.findAll({})

      expect(campaignsService.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      )
    })

    it('builds where from filters', () => {
      vi.spyOn(campaignsService, 'findMany').mockResolvedValue([])

      controller.findAll({ slug: 'test-slug' })

      const call = vi.mocked(campaignsService.findMany).mock.calls[0]?.[0]
      expect(call?.where).toHaveProperty('AND')
    })

    it('includes user and pathToVictory in query', () => {
      vi.spyOn(campaignsService, 'findMany').mockResolvedValue([])

      controller.findAll({})

      expect(campaignsService.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                phone: true,
                email: true,
                metaData: true,
              },
            },
            pathToVictory: {
              select: { data: true },
            },
          },
        }),
      )
    })
  })

  describe('list', () => {
    it('returns paginated campaigns filtered by userId', async () => {
      vi.spyOn(campaignsService, 'listCampaigns').mockResolvedValue({
        data: [mockCampaign],
        meta: { total: 1, offset: 0, limit: 100 },
      })

      const result = await controller.list({ userId: 1 })

      expect(campaignsService.listCampaigns).toHaveBeenCalledWith({
        userId: 1,
      })
      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toHaveProperty('id', mockCampaign.id)
      expect(result.meta).toEqual({ total: 1, offset: 0, limit: 100 })
    })

    it('returns empty data when no campaigns exist', async () => {
      vi.spyOn(campaignsService, 'listCampaigns').mockResolvedValue({
        data: [],
        meta: { total: 0, offset: 0, limit: 100 },
      })

      const result = await controller.list({ userId: 999 })

      expect(result.data).toEqual([])
      expect(result.meta.total).toBe(0)
    })
  })

  describe('findMine', () => {
    it('returns the campaign with positionName', async () => {
      const campaignWithRelations: CampaignWith<
        'organization' | 'pathToVictory'
      > = {
        ...mockCampaign,
        pathToVictory: null as PathToVictory | null,
        organization: {} as Organization,
      }

      const result = await controller.findMine(campaignWithRelations)

      expect(result).toEqual({
        ...campaignWithRelations,
        positionName: 'Mayor',
      })
    })

    it('injects live metrics into pathToVictory.data', async () => {
      const liveMetrics = {
        projectedTurnout: 8000,
        winNumber: 4001,
        voterContactGoal: 20005,
      }
      vi.spyOn(
        campaignsService,
        'fetchLiveRaceTargetMetrics',
      ).mockResolvedValue(liveMetrics)

      const campaignWithRelations: CampaignWith<
        'organization' | 'pathToVictory'
      > = {
        ...mockCampaign,
        pathToVictory: { ...mockP2V, data: { p2vStatus: P2VStatus.complete } },
        organization: {} as Organization,
      }

      const result = await controller.findMine(campaignWithRelations)

      expect(result.pathToVictory?.data).toEqual({
        p2vStatus: P2VStatus.complete,
        ...liveMetrics,
      })
      expect(result.positionName).toBe('Mayor')
    })
  })

  describe('getUserCampaignStatus', () => {
    it('delegates to campaigns.getStatus', async () => {
      vi.spyOn(campaignsService, 'getStatus').mockResolvedValue({
        status: CampaignStatus.candidate,
        slug: mockCampaign.slug,
        isVerified: true,
      })

      const result = await controller.getUserCampaignStatus(mockCampaign)

      expect(campaignsService.getStatus).toHaveBeenCalledWith(mockCampaign)
      expect(result).toEqual({
        status: CampaignStatus.candidate,
        slug: mockCampaign.slug,
        isVerified: true,
      })
    })

    it('handles undefined campaign', async () => {
      vi.spyOn(campaignsService, 'getStatus').mockResolvedValue({
        status: false,
      })

      const result = await controller.getUserCampaignStatus(undefined)

      expect(campaignsService.getStatus).toHaveBeenCalledWith(undefined)
      expect(result).toEqual({ status: false })
    })
  })

  describe('getCampaignPlanVersion', () => {
    it('returns version.data', async () => {
      const versionData = {
        key: [{ date: CREATED_AT, text: 'plan content' }],
      }
      vi.spyOn(planVersionsService, 'findByCampaignId').mockResolvedValue({
        id: 1,
        createdAt: new Date(CREATED_AT),
        updatedAt: new Date(CREATED_AT),
        campaignId: mockCampaign.id,
        data: versionData,
      })

      const result = await controller.getCampaignPlanVersion(mockCampaign)

      expect(planVersionsService.findByCampaignId).toHaveBeenCalledWith(
        mockCampaign.id,
      )
      expect(result).toEqual(versionData)
    })

    it('throws NotFoundException when no version found', async () => {
      vi.spyOn(planVersionsService, 'findByCampaignId').mockResolvedValue(null)

      await expect(
        controller.getCampaignPlanVersion(mockCampaign),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('findBySlug', () => {
    it('returns campaign with resolved positionName', async () => {
      const campaignWithP2V = {
        ...mockCampaign,
        pathToVictory: mockP2V,
        organization: { customPositionName: null, positionId: 'pos-1' },
      }
      vi.spyOn(campaignsService, 'findFirst').mockResolvedValue(campaignWithP2V)
      vi.spyOn(
        organizationsService,
        'resolvePositionContext',
      ).mockResolvedValue({
        ballotReadyPositionId: 'br-pos-1',
        positionName: 'Mayor',
      })

      const result = await controller.findBySlug(mockCampaign.slug)

      expect(campaignsService.findFirst).toHaveBeenCalledWith({
        where: { slug: mockCampaign.slug },
        include: {
          pathToVictory: true,
          organization: {
            select: { customPositionName: true, positionId: true },
          },
        },
      })
      expect(organizationsService.resolvePositionContext).toHaveBeenCalledWith({
        customPositionName: null,
        positionId: 'pos-1',
      })
      expect(result).toEqual({ ...campaignWithP2V, positionName: 'Mayor' })
    })

    it('returns null positionName when no organization', async () => {
      const campaignWithP2V = {
        ...mockCampaign,
        pathToVictory: mockP2V,
        organization: null,
      }
      vi.spyOn(campaignsService, 'findFirst').mockResolvedValue(campaignWithP2V)
      vi.spyOn(
        organizationsService,
        'resolvePositionContext',
      ).mockResolvedValue({
        ballotReadyPositionId: null,
        positionName: null,
      })

      const result = await controller.findBySlug(mockCampaign.slug)

      expect(organizationsService.resolvePositionContext).toHaveBeenCalledWith({
        customPositionName: undefined,
        positionId: undefined,
      })
      expect(result.positionName).toBeNull()
    })

    it('throws NotFoundException when slug not found', async () => {
      vi.spyOn(campaignsService, 'findFirst').mockResolvedValue(null)

      await expect(controller.findBySlug('nonexistent')).rejects.toThrow(
        NotFoundException,
      )
    })

    it('injects live metrics into pathToVictory.data', async () => {
      const liveMetrics = {
        projectedTurnout: 5000,
        winNumber: 2501,
        voterContactGoal: 12505,
      }
      vi.spyOn(
        campaignsService,
        'fetchLiveRaceTargetMetrics',
      ).mockResolvedValue(liveMetrics)

      const campaignWithP2V = {
        ...mockCampaign,
        pathToVictory: { ...mockP2V, data: { p2vStatus: P2VStatus.complete } },
        organization: { customPositionName: null, positionId: 'pos-1' },
      }
      vi.spyOn(campaignsService, 'findFirst').mockResolvedValue(campaignWithP2V)

      const result = await controller.findBySlug(mockCampaign.slug)

      expect(result.pathToVictory?.data).toEqual({
        p2vStatus: P2VStatus.complete,
        ...liveMetrics,
      })
      expect(result.positionName).toBe('Mayor')
    })
  })

  describe('create', () => {
    const mockCreateBody = {
      details: { state: 'CA' },
      ballotReadyPositionId: 'br-pos-1',
    } as CreateCampaignSchema

    it('throws ConflictException when campaign already exists', async () => {
      vi.spyOn(campaignsService, 'findByUserId').mockResolvedValue(mockCampaign)

      await expect(controller.create(mockUser, mockCreateBody)).rejects.toThrow(
        ConflictException,
      )
    })

    it('creates campaign for user when none exists', async () => {
      vi.spyOn(campaignsService, 'findByUserId').mockResolvedValue(null!)
      vi.spyOn(campaignsService, 'createForUser').mockResolvedValue(
        mockCampaign,
      )

      const result = await controller.create(mockUser, mockCreateBody)

      expect(campaignsService.createForUser).toHaveBeenCalledWith(
        mockUser,
        { details: { state: 'CA' }, data: undefined },
        {
          ballotReadyPositionId: 'br-pos-1',
          customPositionName: undefined,
        },
      )
      expect(result).toEqual(mockCampaign)
    })
  })

  describe('update', () => {
    it('throws ForbiddenException for canDownloadFederal when not admin', async () => {
      await expect(
        controller.update(mockUser, mockCampaign, {
          canDownloadFederal: true,
        }),
      ).rejects.toThrow(ForbiddenException)
    })

    it('allows admin to set canDownloadFederal', async () => {
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaignWithP2V,
      )

      await controller.update(mockAdminUser, mockCampaign, {
        canDownloadFederal: true,
      })

      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        mockCampaign.id,
        { canDownloadFederal: true },
      )
    })

    it('admin can override campaign via slug param', async () => {
      vi.spyOn(campaignsService, 'findFirstOrThrow').mockResolvedValue(
        mockOtherCampaign,
      )
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockOtherCampaignWithP2V,
      )

      await controller.update(mockAdminUser, mockCampaign, {
        slug: OVERRIDE_SLUG,
        data: { foo: 'bar' },
      })

      expect(campaignsService.findFirstOrThrow).toHaveBeenCalledWith({
        where: { slug: OVERRIDE_SLUG },
      })
      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        mockOtherCampaign.id,
        { data: { foo: 'bar' } },
      )
    })

    it('sales can override campaign via slug param', async () => {
      vi.spyOn(campaignsService, 'findFirstOrThrow').mockResolvedValue(
        mockOtherCampaign,
      )
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockOtherCampaignWithP2V,
      )

      await controller.update(mockSalesUser, mockCampaign, {
        slug: OVERRIDE_SLUG,
        data: { foo: 'bar' },
      })

      expect(campaignsService.findFirstOrThrow).toHaveBeenCalledWith({
        where: { slug: OVERRIDE_SLUG },
      })
      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        mockOtherCampaign.id,
        { data: { foo: 'bar' } },
      )
    })

    it('calls analytics.identify with detail trait(s) on slug override', async () => {
      const campaignWithUserId: Campaign = { ...mockOtherCampaign, userId: 5 }
      vi.spyOn(campaignsService, 'findFirstOrThrow').mockResolvedValue(
        campaignWithUserId,
      )
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue({
        ...campaignWithUserId,
        pathToVictory: null,
      })
      vi.spyOn(analyticsService, 'identify').mockResolvedValue(undefined)

      await controller.update(mockAdminUser, mockCampaign, {
        slug: OVERRIDE_SLUG,
        details: {
          city: 'Springfield',
          office: 'Mayor',
          electionDate: '2025-11-04',
          party: 'Independent',
          pledged: true,
        },
      })

      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        mockOtherCampaign.id,
        {
          details: {
            city: 'Springfield',
            office: 'Mayor',
            electionDate: '2025-11-04',
            party: 'Independent',
            pledged: true,
          },
        },
      )

      expect(analyticsService.identify).toHaveBeenCalledWith(5, {
        officeMunicipality: 'Springfield',
        officeElectionDate: '2025-11-04',
        affiliation: 'Independent',
        pledged: true,
      })
    })

    it('does not call analytics.identify when details is missing', async () => {
      const campaignWithUserId: Campaign = { ...mockOtherCampaign, userId: 5 }
      vi.spyOn(campaignsService, 'findFirstOrThrow').mockResolvedValue(
        campaignWithUserId,
      )
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue({
        ...campaignWithUserId,
        pathToVictory: null,
      })

      await controller.update(mockAdminUser, mockCampaign, {
        slug: OVERRIDE_SLUG,
        data: { foo: 'bar' },
      })

      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        mockOtherCampaign.id,
        { data: { foo: 'bar' } },
      )

      expect(analyticsService.identify).not.toHaveBeenCalled()
    })

    it('only sends truthy detail fields to analytics.identify', async () => {
      const campaignWithUserId: Campaign = { ...mockOtherCampaign, userId: 5 }
      vi.spyOn(campaignsService, 'findFirstOrThrow').mockResolvedValue(
        campaignWithUserId,
      )
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue({
        ...campaignWithUserId,
        pathToVictory: null,
      })
      vi.spyOn(analyticsService, 'identify').mockResolvedValue(undefined)

      await controller.update(mockAdminUser, mockCampaign, {
        slug: OVERRIDE_SLUG,
        details: { city: 'Springfield' },
      })

      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        mockOtherCampaign.id,
        { details: { city: 'Springfield' } },
      )

      expect(analyticsService.identify).toHaveBeenCalledWith(5, {
        officeMunicipality: 'Springfield',
      })
    })

    it('throws NotFoundException when no campaign and no slug override', async () => {
      await expect(
        controller.update(mockUser, undefined!, {
          data: { foo: 'bar' },
        }),
      ).rejects.toThrow(NotFoundException)
    })

    it('updates campaign with body fields', async () => {
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaignWithP2V,
      )

      const body = { data: { currentStep: 'goals' } }
      const result = await controller.update(mockUser, mockCampaign, body)

      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        mockCampaign.id,
        { data: { currentStep: 'goals' } },
      )
      expect(result).toEqual(mockCampaignWithP2V)
    })
  })

  describe('findById (M2M GET :id)', () => {
    it('returns campaign parsed through ReadCampaignOutputSchema', async () => {
      vi.spyOn(campaignsService, 'findUniqueOrThrow').mockResolvedValue(
        mockCampaign,
      )

      const result = await controller.findById({ id: mockCampaign.id })

      expect(campaignsService.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: mockCampaign.id },
      })
      expect(result).toHaveProperty('id', mockCampaign.id)
    })

    it('throws when campaign does not exist', async () => {
      vi.spyOn(campaignsService, 'findUniqueOrThrow').mockRejectedValue(
        new NotFoundException(),
      )

      await expect(controller.findById({ id: 999 })).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  describe('updateCampaign (M2M PUT :id)', () => {
    beforeEach(() => {
      vi.spyOn(campaignsService, 'findUniqueOrThrow').mockResolvedValue(
        mockCampaign,
      )
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaignWithP2V,
      )
    })

    it('throws NotFoundException when campaign does not exist', async () => {
      vi.spyOn(campaignsService, 'findUniqueOrThrow').mockRejectedValue(
        new NotFoundException(),
      )

      await expect(
        controller.updateCampaign({ id: 999 }, { isActive: true }),
      ).rejects.toThrow(NotFoundException)
    })

    it('updates scalar fields only', async () => {
      const result = await controller.updateCampaign(
        { id: mockCampaign.id },
        { isActive: false, slug: 'new-slug' },
      )

      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        mockCampaign.id,
        { data: undefined, details: undefined, aiContent: undefined },
        true,
        { isActive: false, slug: 'new-slug' },
      )
      expect(result).toEqual(mockCampaignWithP2V)
    })

    it('updates JSON fields only', async () => {
      const result = await controller.updateCampaign(
        { id: mockCampaign.id },
        { data: { name: 'Updated' } },
      )

      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        mockCampaign.id,
        { data: { name: 'Updated' }, details: undefined, aiContent: undefined },
        true,
        undefined,
      )
      expect(result).toEqual(mockCampaignWithP2V)
    })

    it('updates both scalar and JSON fields atomically', async () => {
      const result = await controller.updateCampaign(
        { id: mockCampaign.id },
        { isActive: true, data: { name: 'Updated' }, details: { city: 'LA' } },
      )

      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        mockCampaign.id,
        {
          data: { name: 'Updated' },
          details: { city: 'LA' },
          aiContent: undefined,
        },
        true,
        { isActive: true },
      )
      expect(result).toEqual(mockCampaignWithP2V)
    })

    it('handles empty body without error', async () => {
      const result = await controller.updateCampaign(
        { id: mockCampaign.id },
        {},
      )

      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        mockCampaign.id,
        { data: undefined, details: undefined, aiContent: undefined },
        true,
        undefined,
      )
      expect(result).toEqual(mockCampaignWithP2V)
    })

    it('returns raw data from service (interceptor handles response parsing)', async () => {
      const result = await controller.updateCampaign(
        { id: mockCampaign.id },
        { isActive: true },
      )

      expect(result).toHaveProperty('id')
    })
  })

  describe('launch', () => {
    it('returns launch result on success', async () => {
      vi.spyOn(campaignsService, 'launch').mockResolvedValue(true)

      const result = await controller.launch(mockCampaign)

      expect(campaignsService.launch).toHaveBeenCalledWith(mockCampaign)
      expect(result).toBe(true)
    })

    it('logs, sends Slack message, and re-throws on error', async () => {
      const error = new Error('Launch failed')
      vi.spyOn(campaignsService, 'launch').mockRejectedValue(error)
      vi.spyOn(slackService, 'errorMessage').mockResolvedValue(undefined)

      await expect(controller.launch(mockCampaign)).rejects.toThrow(
        'Launch failed',
      )

      expect(slackService.errorMessage).toHaveBeenCalledWith({
        message: 'Error at campaign launch',
        error,
      })
    })
  })

  describe('setDistrict', () => {
    const districtBody = {
      L2DistrictType: 'State Senate',
      L2DistrictName: 'District 5',
    }

    it('admin can override campaign via slug param', async () => {
      vi.spyOn(campaignsService, 'findFirstOrThrow').mockResolvedValue(
        mockOtherCampaign,
      )
      vi.spyOn(electionsService, 'buildRaceTargetDetails').mockResolvedValue(
        mockRaceTargetResult({ projectedTurnout: 1000 }),
      )
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockOtherCampaignWithP2V,
      )

      await controller.setDistrict(mockCampaign, mockAdminUser, {
        slug: OVERRIDE_SLUG,
        ...districtBody,
      })

      expect(campaignsService.findFirstOrThrow).toHaveBeenCalledWith({
        where: { slug: OVERRIDE_SLUG },
      })
    })

    it('throws NotFoundException when no campaign and no slug override', async () => {
      await expect(
        controller.setDistrict(undefined!, mockUser, districtBody),
      ).rejects.toThrow(NotFoundException)
    })

    it('sets districtMatched when buildRaceTargetDetails returns null', async () => {
      vi.spyOn(electionsService, 'buildRaceTargetDetails').mockResolvedValue(
        null,
      )
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaignWithP2V,
      )

      await controller.setDistrict(mockCampaign, mockUser, districtBody)

      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        mockCampaign.id,
        {
          pathToVictory: {
            p2vStatus: P2VStatus.districtMatched,
            p2vAttempts: 0,
            officeContextFingerprint: null,
          },
          overrideDistrictId: null,
        },
      )
    })

    it('sets districtMatched when projected turnout is zero', async () => {
      vi.spyOn(electionsService, 'buildRaceTargetDetails').mockResolvedValue(
        mockRaceTargetResult({
          projectedTurnout: 0,
          winNumber: 0,
          voterContactGoal: 0,
        }),
      )
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaignWithP2V,
      )

      await controller.setDistrict(mockCampaign, mockUser, districtBody)

      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        mockCampaign.id,
        {
          pathToVictory: {
            p2vStatus: P2VStatus.districtMatched,
            p2vAttempts: 0,
            officeContextFingerprint: null,
          },
          overrideDistrictId: null,
        },
      )
    })

    it('omits districtMatched status when hasTurnout is true', async () => {
      vi.spyOn(electionsService, 'buildRaceTargetDetails').mockResolvedValue(
        mockRaceTargetResult({
          projectedTurnout: 5000,
          winNumber: 2500,
          voterContactGoal: 3000,
        }),
      )
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaignWithP2V,
      )

      await controller.setDistrict(mockCampaign, mockUser, districtBody)

      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        mockCampaign.id,
        {
          pathToVictory: {
            p2vAttempts: 0,
            officeContextFingerprint: null,
          },
          overrideDistrictId: null,
        },
      )

      const callArgs = vi.mocked(campaignsService.updateJsonFields).mock
        .calls[0][1]
      expect(callArgs.pathToVictory?.p2vStatus).not.toBe(
        P2VStatus.districtMatched,
      )
    })

    it('writes minimal pathToVictory payload when hasTurnout is true', async () => {
      vi.spyOn(electionsService, 'buildRaceTargetDetails').mockResolvedValue(
        mockRaceTargetResult({ projectedTurnout: 5000 }),
      )
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaignWithP2V,
      )

      await controller.setDistrict(mockCampaign, mockUser, districtBody)

      const callArgs = vi.mocked(campaignsService.updateJsonFields).mock
        .calls[0][1]
      expect(callArgs.pathToVictory).toEqual({
        p2vAttempts: 0,
        officeContextFingerprint: null,
      })
    })

    it('passes overrideDistrictId to updateJsonFields', async () => {
      vi.spyOn(electionsService, 'buildRaceTargetDetails').mockResolvedValue(
        mockRaceTargetResult({ projectedTurnout: 5000 }),
      )
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaignWithP2V,
      )
      vi.spyOn(
        organizationsService,
        'resolveOverrideDistrictId',
      ).mockResolvedValue('district-uuid-123')

      await controller.setDistrict(mockCampaign, mockUser, districtBody)

      expect(
        organizationsService.resolveOverrideDistrictId,
      ).toHaveBeenCalledWith({
        positionId: 'pos-1',
        state: 'CA',
        L2DistrictType: 'State Senate',
        L2DistrictName: 'District 5',
      })
      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        mockCampaign.id,
        expect.objectContaining({
          overrideDistrictId: 'district-uuid-123',
        }),
      )
    })

    it('passes null overrideDistrictId when resolveOverrideDistrictId returns null', async () => {
      vi.spyOn(electionsService, 'buildRaceTargetDetails').mockResolvedValue(
        mockRaceTargetResult({ projectedTurnout: 5000 }),
      )
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaignWithP2V,
      )
      vi.spyOn(
        organizationsService,
        'resolveOverrideDistrictId',
      ).mockResolvedValue(null)

      await controller.setDistrict(mockCampaign, mockUser, districtBody)

      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        mockCampaign.id,
        expect.objectContaining({
          overrideDistrictId: null,
        }),
      )
    })

    it('fails the request when resolveOverrideDistrictId rejects', async () => {
      vi.spyOn(electionsService, 'buildRaceTargetDetails').mockResolvedValue(
        mockRaceTargetResult({ projectedTurnout: 5000 }),
      )
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaignWithP2V,
      )
      vi.spyOn(
        organizationsService,
        'resolveOverrideDistrictId',
      ).mockRejectedValue(new Error('Election API down'))

      await expect(
        controller.setDistrict(mockCampaign, mockUser, districtBody),
      ).rejects.toThrow('Election API down')
    })

    it('passes undefined positionId when campaign has no positionId', async () => {
      const campaignNoPosition: Campaign = {
        ...mockCampaign,
        details: { electionDate: '2025-11-04', state: 'CA' },
      }
      vi.spyOn(electionsService, 'buildRaceTargetDetails').mockResolvedValue(
        mockRaceTargetResult({ projectedTurnout: 5000 }),
      )
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaignWithP2V,
      )
      vi.spyOn(organizationsService, 'findUnique').mockResolvedValue(null)

      await controller.setDistrict(campaignNoPosition, mockUser, districtBody)

      expect(
        organizationsService.resolveOverrideDistrictId,
      ).toHaveBeenCalledWith({
        positionId: undefined,
        state: 'CA',
        L2DistrictType: 'State Senate',
        L2DistrictName: 'District 5',
      })
    })
  })

  describe('setDistrictM2M', () => {
    const districtBody = {
      L2DistrictType: 'State Senate',
      L2DistrictName: 'District 5',
    }

    it('throws when campaign is not found', async () => {
      vi.spyOn(campaignsService, 'findUniqueOrThrow').mockRejectedValue(
        new NotFoundException('Campaign not found'),
      )

      await expect(
        controller.setDistrictM2M({ id: 999 }, districtBody),
      ).rejects.toThrow(NotFoundException)

      expect(campaignsService.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 999 },
      })
    })

    it('calls applyDistrictUpdate with the resolved campaign and district values', async () => {
      vi.spyOn(campaignsService, 'findUniqueOrThrow').mockResolvedValue(
        mockCampaign,
      )
      vi.spyOn(electionsService, 'buildRaceTargetDetails').mockResolvedValue(
        mockRaceTargetResult({
          projectedTurnout: 5000,
          winNumber: 2500,
          voterContactGoal: 3000,
        }),
      )
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaignWithP2V,
      )

      await controller.setDistrictM2M({ id: mockCampaign.id }, districtBody)

      expect(campaignsService.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: mockCampaign.id },
      })
      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        mockCampaign.id,
        {
          pathToVictory: {
            p2vAttempts: 0,
            officeContextFingerprint: null,
          },
          overrideDistrictId: null,
        },
      )
    })

    it('works without user context (M2M auth)', async () => {
      vi.spyOn(campaignsService, 'findUniqueOrThrow').mockResolvedValue(
        mockCampaign,
      )
      vi.spyOn(electionsService, 'buildRaceTargetDetails').mockResolvedValue(
        null,
      )
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaignWithP2V,
      )

      const result = await controller.setDistrictM2M(
        { id: mockCampaign.id },
        districtBody,
      )

      expect(result).toBeDefined()
      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        mockCampaign.id,
        {
          pathToVictory: {
            p2vStatus: P2VStatus.districtMatched,
            p2vAttempts: 0,
            officeContextFingerprint: null,
          },
          overrideDistrictId: null,
        },
      )
    })

    it('sets districtMatched when buildRaceTargetDetails returns null (M2M)', async () => {
      vi.spyOn(campaignsService, 'findUniqueOrThrow').mockResolvedValue(
        mockCampaign,
      )
      vi.spyOn(electionsService, 'buildRaceTargetDetails').mockResolvedValue(
        null,
      )
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaignWithP2V,
      )

      await controller.setDistrictM2M({ id: mockCampaign.id }, districtBody)

      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        mockCampaign.id,
        {
          pathToVictory: {
            p2vStatus: P2VStatus.districtMatched,
            p2vAttempts: 0,
            officeContextFingerprint: null,
          },
          overrideDistrictId: null,
        },
      )
    })
  })

  describe('updateRaceTargetDetails', () => {
    it('throws BadRequestException when no positionId', async () => {
      const campaign: Campaign = {
        ...mockCampaign,
        details: { electionDate: '2025-11-04' },
      }
      vi.spyOn(organizationsService, 'findUnique').mockResolvedValue(null)
      vi.spyOn(
        organizationsService,
        'resolvePositionContext',
      ).mockResolvedValue({
        ballotReadyPositionId: null,
        positionName: null,
      })

      await expect(
        controller.updateRaceTargetDetails(campaign),
      ).rejects.toThrow(BadRequestException)
    })

    it('throws BadRequestException when no electionDate', async () => {
      const campaign: Campaign = {
        ...mockCampaign,
        details: {} as Campaign['details'],
      }

      await expect(
        controller.updateRaceTargetDetails(campaign),
      ).rejects.toThrow(BadRequestException)
    })

    it('sets failed status when raceTargetDetails is null', async () => {
      vi.spyOn(
        electionsService,
        'getPositionMatchedRaceTargetDetails',
      ).mockResolvedValue(null!)
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaignWithP2V,
      )

      await controller.updateRaceTargetDetails(mockCampaign)

      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        mockCampaign.id,
        {
          pathToVictory: {
            p2vStatus: P2VStatus.failed,
            p2vAttempts: 0,
            officeContextFingerprint: null,
          },
        },
      )
    })

    it('updates with complete status when hasTurnout', async () => {
      vi.spyOn(
        electionsService,
        'getPositionMatchedRaceTargetDetails',
      ).mockResolvedValue(mockRaceTargetDetails)
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaignWithP2V,
      )

      await controller.updateRaceTargetDetails(mockCampaign)

      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        mockCampaign.id,
        {
          pathToVictory: expect.objectContaining({
            source: P2VSource.ElectionApi,
            p2vStatus: P2VStatus.complete,
            p2vCompleteDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            p2vAttempts: 0,
            officeContextFingerprint: null,
          }),
        },
      )
    })

    it('updates with districtMatched status when no turnout', async () => {
      const noTurnout = { ...mockRaceTargetDetails, projectedTurnout: 0 }
      vi.spyOn(
        electionsService,
        'getPositionMatchedRaceTargetDetails',
      ).mockResolvedValue(noTurnout)
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaignWithP2V,
      )

      await controller.updateRaceTargetDetails(mockCampaign)

      const callArgs = vi.mocked(campaignsService.updateJsonFields).mock
        .calls[0][1]
      expect(callArgs.pathToVictory?.p2vStatus).toBe(P2VStatus.districtMatched)
    })

    it('passes includeTurnout: true and officeName to elections service', async () => {
      vi.spyOn(
        electionsService,
        'getPositionMatchedRaceTargetDetails',
      ).mockResolvedValue(mockRaceTargetDetails)
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaignWithP2V,
      )

      await controller.updateRaceTargetDetails(mockCampaign)

      expect(
        electionsService.getPositionMatchedRaceTargetDetails,
      ).toHaveBeenCalledWith({
        campaignId: mockCampaign.id,
        ballotreadyPositionId: 'br-pos-1',
        electionDate: '2025-11-04',
        includeTurnout: true,
        officeName: 'Mayor',
      })
    })

    it('passes undefined officeName when org resolver returns null', async () => {
      vi.spyOn(
        organizationsService,
        'resolvePositionContext',
      ).mockResolvedValue({
        ballotReadyPositionId: 'br-pos-1',
        positionName: null,
      })
      vi.spyOn(
        electionsService,
        'getPositionMatchedRaceTargetDetails',
      ).mockResolvedValue(mockRaceTargetDetails)
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaignWithP2V,
      )

      await controller.updateRaceTargetDetails(mockCampaign)

      expect(
        electionsService.getPositionMatchedRaceTargetDetails,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          officeName: undefined,
        }),
      )
    })
  })

  describe('updateRaceTargetDetailsBySlug', () => {
    function setupSlugMocks(raceDetails = mockRaceTargetDetails) {
      vi.spyOn(campaignsService, 'findFirstOrThrow').mockResolvedValue(
        mockCampaign,
      )
      vi.spyOn(
        electionsService,
        'getPositionMatchedRaceTargetDetails',
      ).mockResolvedValue(raceDetails)
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaignWithP2V,
      )
    }

    it('loads campaign by slug', async () => {
      setupSlugMocks()

      await controller.updateRaceTargetDetailsBySlug(mockCampaign.slug, {})

      expect(campaignsService.findFirstOrThrow).toHaveBeenCalledWith({
        where: { slug: mockCampaign.slug },
      })
    })

    it('passes includeTurnout from query param', async () => {
      setupSlugMocks()

      await controller.updateRaceTargetDetailsBySlug(mockCampaign.slug, {
        includeTurnout: false,
      })

      expect(
        electionsService.getPositionMatchedRaceTargetDetails,
      ).toHaveBeenCalledWith(expect.objectContaining({ includeTurnout: false }))
    })

    it('defaults includeTurnout to true when not specified', async () => {
      setupSlugMocks()

      await controller.updateRaceTargetDetailsBySlug(mockCampaign.slug, {})

      expect(
        electionsService.getPositionMatchedRaceTargetDetails,
      ).toHaveBeenCalledWith(expect.objectContaining({ includeTurnout: true }))
    })

    it('throws BadRequestException when campaign has no positionId', async () => {
      const campaignNoPosition: Campaign = {
        ...mockCampaign,
        details: { electionDate: '2025-11-04' },
      }
      vi.spyOn(campaignsService, 'findFirstOrThrow').mockResolvedValue(
        campaignNoPosition,
      )
      vi.spyOn(organizationsService, 'findUnique').mockResolvedValue(null)
      vi.spyOn(
        organizationsService,
        'resolvePositionContext',
      ).mockResolvedValue({
        ballotReadyPositionId: null,
        positionName: null,
      })

      await expect(
        controller.updateRaceTargetDetailsBySlug(mockCampaign.slug, {}),
      ).rejects.toThrow(BadRequestException)
    })

    it('sets failed status when raceTargetDetails is null', async () => {
      vi.spyOn(campaignsService, 'findFirstOrThrow').mockResolvedValue(
        mockCampaign,
      )
      vi.spyOn(
        electionsService,
        'getPositionMatchedRaceTargetDetails',
      ).mockResolvedValue(null!)
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaignWithP2V,
      )

      await controller.updateRaceTargetDetailsBySlug(mockCampaign.slug, {})

      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        mockCampaign.id,
        {
          pathToVictory: {
            p2vStatus: P2VStatus.failed,
            p2vAttempts: 0,
            officeContextFingerprint: null,
          },
        },
      )
    })

    it('sets complete status when hasTurnout', async () => {
      setupSlugMocks()

      await controller.updateRaceTargetDetailsBySlug(mockCampaign.slug, {})

      const callArgs = vi.mocked(campaignsService.updateJsonFields).mock
        .calls[0][1]
      expect(callArgs.pathToVictory?.p2vStatus).toBe(P2VStatus.complete)
      expect(callArgs.pathToVictory?.p2vCompleteDate).toMatch(
        /^\d{4}-\d{2}-\d{2}$/,
      )
      expect(callArgs.pathToVictory?.source).toBe(P2VSource.ElectionApi)
    })

    it('sets districtMatched status when no turnout', async () => {
      setupSlugMocks({ ...mockRaceTargetDetails, projectedTurnout: 0 })

      await controller.updateRaceTargetDetailsBySlug(mockCampaign.slug, {})

      const callArgs = vi.mocked(campaignsService.updateJsonFields).mock
        .calls[0][1]
      expect(callArgs.pathToVictory?.p2vStatus).toBe(P2VStatus.districtMatched)
    })
  })
})
