import { OrganizationsService } from '@/organizations/services/organizations.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { CampaignStatus } from '@goodparty_org/contracts'
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { Campaign, Organization, User, UserRole } from '@prisma/client'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CampaignsController } from './campaigns.controller'
import { CreateCampaignSchema } from './schemas/updateCampaign.schema'
import { CampaignPlanVersionsService } from './services/campaignPlanVersions.service'
import { CampaignsService } from './services/campaigns.service'
import { CampaignWith } from './campaigns.types'

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

const OVERRIDE_SLUG = 'other'

const mockOtherCampaign: Campaign = {
  ...mockCampaign,
  id: 200,
  slug: OVERRIDE_SLUG,
}

describe('CampaignsController', () => {
  let controller: CampaignsController
  let campaignsService: CampaignsService
  let planVersionsService: CampaignPlanVersionsService
  let slackService: SlackService
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

    it('includes user in query', () => {
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
    it('returns the campaign with positionName and raceTargetMetrics', async () => {
      const campaignWithRelations: CampaignWith<'organization'> = {
        ...mockCampaign,
        organization: {} as Organization,
      }

      const result = await controller.findMine(campaignWithRelations)

      expect(result).toEqual({
        ...campaignWithRelations,
        positionName: 'Mayor',
        raceTargetMetrics: null,
      })
    })

    it('includes live metrics in raceTargetMetrics', async () => {
      const liveMetrics = {
        projectedTurnout: 8000,
        winNumber: 4001,
        voterContactGoal: 20005,
      }
      vi.spyOn(
        campaignsService,
        'fetchLiveRaceTargetMetrics',
      ).mockResolvedValue(liveMetrics)

      const campaignWithRelations: CampaignWith<'organization'> = {
        ...mockCampaign,
        organization: {} as Organization,
      }

      const result = await controller.findMine(campaignWithRelations)

      expect(result.raceTargetMetrics).toEqual(liveMetrics)
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
      const campaignWithOrg = {
        ...mockCampaign,
        organization: { customPositionName: null, positionId: 'pos-1' },
      }
      vi.spyOn(campaignsService, 'findFirst').mockResolvedValue(campaignWithOrg)
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
          organization: {
            select: { customPositionName: true, positionId: true },
          },
        },
      })
      expect(organizationsService.resolvePositionContext).toHaveBeenCalledWith({
        customPositionName: null,
        positionId: 'pos-1',
      })
      expect(result).toEqual({
        ...campaignWithOrg,
        positionName: 'Mayor',
        raceTargetMetrics: null,
      })
    })

    it('returns null positionName when no organization', async () => {
      const campaignWithOrg = {
        ...mockCampaign,
        organization: null,
      }
      vi.spyOn(campaignsService, 'findFirst').mockResolvedValue(campaignWithOrg)
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

    it('includes live metrics in raceTargetMetrics', async () => {
      const liveMetrics = {
        projectedTurnout: 5000,
        winNumber: 2501,
        voterContactGoal: 12505,
      }
      vi.spyOn(
        campaignsService,
        'fetchLiveRaceTargetMetrics',
      ).mockResolvedValue(liveMetrics)

      const campaignWithOrg = {
        ...mockCampaign,
        organization: { customPositionName: null, positionId: 'pos-1' },
      }
      vi.spyOn(campaignsService, 'findFirst').mockResolvedValue(campaignWithOrg)

      const result = await controller.findBySlug(mockCampaign.slug)

      expect(result.raceTargetMetrics).toEqual(liveMetrics)
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
        mockCampaign,
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
        mockOtherCampaign,
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
        mockOtherCampaign,
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
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        campaignWithUserId,
      )
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
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        campaignWithUserId,
      )

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
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        campaignWithUserId,
      )
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
        mockCampaign,
      )

      const body = { data: { currentStep: 'goals' } }
      const result = await controller.update(mockUser, mockCampaign, body)

      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        mockCampaign.id,
        { data: { currentStep: 'goals' } },
      )
      expect(result).toEqual(mockCampaign)
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
        mockCampaign,
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
      expect(result).toEqual(mockCampaign)
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
      expect(result).toEqual(mockCampaign)
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
      expect(result).toEqual(mockCampaign)
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
      expect(result).toEqual(mockCampaign)
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
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockOtherCampaign,
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

    it('passes overrideDistrictId to updateJsonFields', async () => {
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaign,
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
        { overrideDistrictId: 'district-uuid-123' },
      )
    })

    it('passes null overrideDistrictId when resolveOverrideDistrictId returns null', async () => {
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaign,
      )
      vi.spyOn(
        organizationsService,
        'resolveOverrideDistrictId',
      ).mockResolvedValue(null)

      await controller.setDistrict(mockCampaign, mockUser, districtBody)

      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        mockCampaign.id,
        { overrideDistrictId: null },
      )
    })

    it('fails the request when resolveOverrideDistrictId rejects', async () => {
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaign,
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
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaign,
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
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaign,
      )

      await controller.setDistrictM2M({ id: mockCampaign.id }, districtBody)

      expect(campaignsService.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: mockCampaign.id },
      })
      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        mockCampaign.id,
        { overrideDistrictId: null },
      )
    })

    it('works without user context (M2M auth)', async () => {
      vi.spyOn(campaignsService, 'findUniqueOrThrow').mockResolvedValue(
        mockCampaign,
      )
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaign,
      )

      const result = await controller.setDistrictM2M(
        { id: mockCampaign.id },
        districtBody,
      )

      expect(result).toBeDefined()
      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        mockCampaign.id,
        { overrideDistrictId: null },
      )
    })
  })
})
