import { InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { Campaign, User, UserRole } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { ElectionsService } from 'src/elections/services/elections.service'
import { P2VStatus } from 'src/elections/types/pathToVictory.types'
import { EnqueuePathToVictoryService } from 'src/pathToVictory/services/enqueuePathToVictory.service'
import { PathToVictoryService } from 'src/pathToVictory/services/pathToVictory.service'
import { P2VSource } from 'src/pathToVictory/types/pathToVictory.types'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { CampaignsController } from './campaigns.controller'
import { CampaignPlanVersionsService } from './services/campaignPlanVersions.service'
import { CampaignsService } from './services/campaigns.service'

describe('CampaignsController - setDistrict', () => {
  let controller: CampaignsController
  let campaignsService: CampaignsService
  let electionsService: ElectionsService

  const mockCampaign = {
    id: 1,
    slug: 'test-campaign',
    userId: 1,
    details: {
      state: 'GA',
      electionDate: '2025-11-03',
    },
  } as Campaign

  const mockAdminUser = {
    id: 1,
    roles: [UserRole.admin],
  } as User

  const mockRegularUser = {
    id: 2,
    roles: [],
  } as User

  beforeEach(() => {
    campaignsService = {
      findFirstOrThrow: vi.fn(),
      updateJsonFields: vi.fn(),
    } as unknown as CampaignsService

    electionsService = {
      buildRaceTargetDetails: vi.fn(),
    } as unknown as ElectionsService

    controller = new CampaignsController(
      campaignsService,
      {} as CampaignPlanVersionsService,
      {} as SlackService,
      {} as PathToVictoryService,
      {} as EnqueuePathToVictoryService,
      electionsService,
      {} as AnalyticsService,
    )

    vi.clearAllMocks()
  })

  describe('with valid projected turnout', () => {
    it('saves district with race target details', async () => {
      const mockRaceTargetDetails = {
        projectedTurnout: 5000,
        winNumber: 2501,
        voterContactGoal: 12505,
        source: P2VSource.ElectionApi,
        p2vStatus: P2VStatus.complete,
        p2vCompleteDate: '2025-01-01',
      }

      vi.spyOn(electionsService, 'buildRaceTargetDetails').mockResolvedValue(
        mockRaceTargetDetails,
      )
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaign,
      )

      await controller.setDistrict(mockCampaign, mockRegularUser, {
        L2DistrictType: 'Town_District',
        L2DistrictName: 'CREOLA TOWN',
      })

      expect(electionsService.buildRaceTargetDetails).toHaveBeenCalledWith({
        L2DistrictType: 'Town_District',
        L2DistrictName: 'CREOLA TOWN',
        electionDate: '2025-11-03',
        state: 'GA',
      })

      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(1, {
        pathToVictory: {
          ...mockRaceTargetDetails,
          electionType: 'Town_District',
          electionLocation: 'CREOLA TOWN',
          districtManuallySet: true,
        },
      })
    })
  })

  describe('without projected turnout', () => {
    it('throws InternalServerErrorException when allowMissingTurnout is false', async () => {
      vi.spyOn(electionsService, 'buildRaceTargetDetails').mockResolvedValue(
        null,
      )

      await expect(
        controller.setDistrict(mockCampaign, mockRegularUser, {
          L2DistrictType: 'Town_District',
          L2DistrictName: 'UNKNOWN TOWN',
          allowMissingTurnout: false,
        }),
      ).rejects.toThrow(InternalServerErrorException)

      await expect(
        controller.setDistrict(mockCampaign, mockRegularUser, {
          L2DistrictType: 'Town_District',
          L2DistrictName: 'UNKNOWN TOWN',
        }),
      ).rejects.toThrow(
        'Error: An invalid L2District was likely passed to the user and selected by the user',
      )

      expect(campaignsService.updateJsonFields).not.toHaveBeenCalled()
    })

    it('throws InternalServerErrorException when projectedTurnout is 0', async () => {
      vi.spyOn(electionsService, 'buildRaceTargetDetails').mockResolvedValue({
        projectedTurnout: 0,
        winNumber: 0,
        voterContactGoal: 0,
        source: P2VSource.ElectionApi,
        p2vStatus: P2VStatus.complete,
        p2vCompleteDate: '2025-01-01',
      })

      await expect(
        controller.setDistrict(mockCampaign, mockRegularUser, {
          L2DistrictType: 'Town_District',
          L2DistrictName: 'ZERO TURNOUT TOWN',
        }),
      ).rejects.toThrow(InternalServerErrorException)

      expect(campaignsService.updateJsonFields).not.toHaveBeenCalled()
    })

    it('saves district with sentinel values when allowMissingTurnout is true and buildRaceTargetDetails returns null', async () => {
      vi.spyOn(electionsService, 'buildRaceTargetDetails').mockResolvedValue(
        null,
      )
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaign,
      )

      await controller.setDistrict(mockCampaign, mockAdminUser, {
        L2DistrictType: 'Town_District',
        L2DistrictName: 'UNKNOWN TOWN',
        allowMissingTurnout: true,
      })

      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(1, {
        pathToVictory: {
          electionType: 'Town_District',
          electionLocation: 'UNKNOWN TOWN',
          districtManuallySet: true,
          projectedTurnout: -1,
          winNumber: -1,
          voterContactGoal: -1,
          source: P2VSource.ElectionApi,
          p2vStatus: P2VStatus.waiting,
        },
      })
    })

    it('saves district with sentinel values when allowMissingTurnout is true and projectedTurnout is 0', async () => {
      vi.spyOn(electionsService, 'buildRaceTargetDetails').mockResolvedValue({
        projectedTurnout: 0,
        winNumber: 0,
        voterContactGoal: 0,
        source: P2VSource.ElectionApi,
        p2vStatus: P2VStatus.complete,
        p2vCompleteDate: '2025-01-01',
      })
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        mockCampaign,
      )

      await controller.setDistrict(mockCampaign, mockAdminUser, {
        L2DistrictType: 'Town_District',
        L2DistrictName: 'ZERO TURNOUT TOWN',
        allowMissingTurnout: true,
      })

      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(1, {
        pathToVictory: {
          electionType: 'Town_District',
          electionLocation: 'ZERO TURNOUT TOWN',
          districtManuallySet: true,
          projectedTurnout: -1,
          winNumber: -1,
          voterContactGoal: -1,
          source: P2VSource.ElectionApi,
          p2vStatus: P2VStatus.waiting,
        },
      })
    })
  })

  describe('admin slug override', () => {
    it('allows admin to update another campaign by slug', async () => {
      const otherCampaign = {
        ...mockCampaign,
        id: 2,
        slug: 'other-campaign',
      } as Campaign

      vi.spyOn(campaignsService, 'findFirstOrThrow').mockResolvedValue(
        otherCampaign,
      )
      vi.spyOn(electionsService, 'buildRaceTargetDetails').mockResolvedValue({
        projectedTurnout: 5000,
        winNumber: 2501,
        voterContactGoal: 12505,
        source: P2VSource.ElectionApi,
        p2vStatus: P2VStatus.complete,
        p2vCompleteDate: '2025-01-01',
      })
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        otherCampaign,
      )

      await controller.setDistrict(mockCampaign, mockAdminUser, {
        slug: 'other-campaign',
        L2DistrictType: 'Town_District',
        L2DistrictName: 'CREOLA TOWN',
      })

      expect(campaignsService.findFirstOrThrow).toHaveBeenCalledWith({
        where: { slug: 'other-campaign' },
      })

      // Verify the campaign being updated is the one fetched by slug (id: 2), not the user's campaign (id: 1)
      expect(campaignsService.updateJsonFields).toHaveBeenCalledWith(
        2,
        expect.any(Object),
      )
    })

    it('throws NotFoundException when campaign is not found', async () => {
      await expect(
        controller.setDistrict(
          null as unknown as Campaign,
          mockRegularUser,
          {
            L2DistrictType: 'Town_District',
            L2DistrictName: 'CREOLA TOWN',
          },
        ),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('handles missing campaign details', () => {
    it('uses empty strings when campaign details are missing', async () => {
      const campaignWithoutDetails = {
        ...mockCampaign,
        details: undefined,
      } as unknown as Campaign

      vi.spyOn(electionsService, 'buildRaceTargetDetails').mockResolvedValue({
        projectedTurnout: 5000,
        winNumber: 2501,
        voterContactGoal: 12505,
        source: P2VSource.ElectionApi,
        p2vStatus: P2VStatus.complete,
        p2vCompleteDate: '2025-01-01',
      })
      vi.spyOn(campaignsService, 'updateJsonFields').mockResolvedValue(
        campaignWithoutDetails,
      )

      await controller.setDistrict(campaignWithoutDetails, mockRegularUser, {
        L2DistrictType: 'Town_District',
        L2DistrictName: 'CREOLA TOWN',
      })

      expect(electionsService.buildRaceTargetDetails).toHaveBeenCalledWith({
        L2DistrictType: 'Town_District',
        L2DistrictName: 'CREOLA TOWN',
        electionDate: '',
        state: '',
      })
    })
  })
})
