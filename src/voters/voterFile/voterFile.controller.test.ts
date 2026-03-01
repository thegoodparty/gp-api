import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Campaign, VoterFileFilter } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VoterFileController } from './voterFile.controller'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'

describe('VoterFileController', () => {
  let controller: VoterFileController
  let mockVoterFileService: Record<string, ReturnType<typeof vi.fn>>
  let mockVoterOutreachService: Record<string, ReturnType<typeof vi.fn>>
  let mockVoterFileDownloadAccess: Record<string, ReturnType<typeof vi.fn>>
  let mockCampaignsService: Record<string, ReturnType<typeof vi.fn>>
  let mockVoterFileFilterService: {
    create: ReturnType<typeof vi.fn>
    findByIdAndCampaignId: ReturnType<typeof vi.fn>
    updateByIdAndCampaignId: ReturnType<typeof vi.fn>
  }
  let mockOutreachService: {
    model: { findFirst: ReturnType<typeof vi.fn> }
  }
  let mockElectedOfficeService: {
    getCurrentElectedOffice: ReturnType<typeof vi.fn>
  }

  const baseCampaign = {
    id: 1,
    userId: 100,
    isPro: false,
  } as Campaign

  const mockFilter = {
    id: 1,
    campaignId: 1,
    name: 'Test Filter',
  } as VoterFileFilter

  beforeEach(() => {
    mockVoterFileService = {}
    mockVoterOutreachService = {}
    mockVoterFileDownloadAccess = {}
    mockCampaignsService = {}
    mockVoterFileFilterService = {
      create: vi.fn().mockResolvedValue(mockFilter),
      findByIdAndCampaignId: vi.fn().mockResolvedValue(mockFilter),
      updateByIdAndCampaignId: vi.fn().mockResolvedValue(mockFilter),
    }
    mockOutreachService = {
      model: { findFirst: vi.fn() },
    }
    mockElectedOfficeService = {
      getCurrentElectedOffice: vi.fn().mockResolvedValue(null),
    }

    controller = new VoterFileController(
      mockVoterFileService as never,
      mockVoterOutreachService as never,
      mockVoterFileDownloadAccess as never,
      mockCampaignsService as never,
      mockVoterFileFilterService as never,
      mockOutreachService as never,
      mockElectedOfficeService as never,
      createMockLogger(),
    )
    vi.clearAllMocks()
  })

  describe('createVoterFileFilter', () => {
    it('throws BadRequestException when campaign is not pro and user has no elected office', async () => {
      mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue(null)
      const campaign = { ...baseCampaign, isPro: false }
      const body = { name: 'My Filter' } as never

      await expect(
        controller.createVoterFileFilter(campaign, body),
      ).rejects.toThrow(BadRequestException)
      await expect(
        controller.createVoterFileFilter(campaign, body),
      ).rejects.toThrow('Campaign is not pro')

      expect(
        mockElectedOfficeService.getCurrentElectedOffice,
      ).toHaveBeenCalledWith(campaign.userId)
      expect(mockVoterFileFilterService.create).not.toHaveBeenCalled()
    })

    it('creates filter when campaign is pro', async () => {
      mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue(null)
      const campaign = { ...baseCampaign, isPro: true }
      const body = { name: 'My Filter' } as never

      const result = await controller.createVoterFileFilter(campaign, body)

      expect(
        mockElectedOfficeService.getCurrentElectedOffice,
      ).toHaveBeenCalledWith(campaign.userId)
      expect(mockVoterFileFilterService.create).toHaveBeenCalledWith(
        campaign.id,
        body,
      )
      expect(result).toEqual(mockFilter)
    })

    it('creates filter when user has elected office', async () => {
      mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue({
        id: 'office-1',
        userId: 100,
        isActive: true,
      })
      const campaign = { ...baseCampaign, isPro: false }
      const body = { name: 'My Filter' } as never

      const result = await controller.createVoterFileFilter(campaign, body)

      expect(
        mockElectedOfficeService.getCurrentElectedOffice,
      ).toHaveBeenCalledWith(campaign.userId)
      expect(mockVoterFileFilterService.create).toHaveBeenCalledWith(
        campaign.id,
        body,
      )
      expect(result).toEqual(mockFilter)
    })
  })

  describe('updateVoterFileFilter', () => {
    it('throws BadRequestException when campaign is not pro and user has no elected office', async () => {
      mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue(null)
      const campaign = { ...baseCampaign, isPro: false }
      const body = { name: 'Updated Filter' } as never

      await expect(
        controller.updateVoterFileFilter(1, body, campaign),
      ).rejects.toThrow(BadRequestException)
      await expect(
        controller.updateVoterFileFilter(1, body, campaign),
      ).rejects.toThrow('Campaign is not pro')

      expect(
        mockElectedOfficeService.getCurrentElectedOffice,
      ).toHaveBeenCalledWith(campaign.userId)
      expect(
        mockVoterFileFilterService.updateByIdAndCampaignId,
      ).not.toHaveBeenCalled()
    })

    it('updates filter when campaign is pro', async () => {
      mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue(null)
      const campaign = { ...baseCampaign, isPro: true }
      const body = { name: 'Updated Filter' } as never

      const result = await controller.updateVoterFileFilter(1, body, campaign)

      expect(
        mockElectedOfficeService.getCurrentElectedOffice,
      ).toHaveBeenCalledWith(campaign.userId)
      expect(
        mockVoterFileFilterService.findByIdAndCampaignId,
      ).toHaveBeenCalledWith(1, campaign.id)
      expect(
        mockVoterFileFilterService.updateByIdAndCampaignId,
      ).toHaveBeenCalledWith(1, campaign.id, body)
      expect(result).toEqual(mockFilter)
    })

    it('updates filter when user has elected office', async () => {
      mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue({
        id: 'office-1',
        userId: 100,
        isActive: true,
      })
      const campaign = { ...baseCampaign, isPro: false }
      const body = { name: 'Updated Filter' } as never

      const result = await controller.updateVoterFileFilter(1, body, campaign)

      expect(
        mockElectedOfficeService.getCurrentElectedOffice,
      ).toHaveBeenCalledWith(campaign.userId)
      expect(
        mockVoterFileFilterService.updateByIdAndCampaignId,
      ).toHaveBeenCalledWith(1, campaign.id, body)
      expect(result).toEqual(mockFilter)
    })

    it('throws NotFoundException when filter does not exist for campaign', async () => {
      mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue(null)
      mockVoterFileFilterService.findByIdAndCampaignId.mockResolvedValue(null)
      const campaign = { ...baseCampaign, isPro: true }
      const body = { name: 'Updated Filter' } as never

      await expect(
        controller.updateVoterFileFilter(1, body, campaign),
      ).rejects.toThrow(NotFoundException)
      await expect(
        controller.updateVoterFileFilter(1, body, campaign),
      ).rejects.toThrow('Voter file filter not found')

      expect(
        mockVoterFileFilterService.updateByIdAndCampaignId,
      ).not.toHaveBeenCalled()
    })
  })

  describe('scheduleOutreachCampaign', () => {
    const mockUser = { id: 1, email: 'user@example.com' } as never

    it('queries outreach scoped to campaign ID and delegates to voterOutreachService', async () => {
      const mockOutreach = {
        id: 10,
        campaignId: 1,
        voterFileFilter: null,
      }
      mockOutreachService.model.findFirst.mockResolvedValue(mockOutreach)
      mockVoterOutreachService.scheduleOutreachCampaign = vi
        .fn()
        .mockResolvedValue({ success: true })

      const result = await controller.scheduleOutreachCampaign(
        mockUser,
        baseCampaign,
        { outreachId: 10, audienceRequest: 'all voters' },
      )

      expect(mockOutreachService.model.findFirst).toHaveBeenCalledWith({
        where: { id: 10, campaignId: baseCampaign.id },
        include: { voterFileFilter: true },
      })
      expect(
        mockVoterOutreachService.scheduleOutreachCampaign,
      ).toHaveBeenCalledWith(mockUser, baseCampaign, mockOutreach, 'all voters')
      expect(result).toEqual({ success: true })
    })

    it('throws NotFoundException when outreach does not exist for campaign', async () => {
      mockOutreachService.model.findFirst.mockResolvedValue(null)

      await expect(
        controller.scheduleOutreachCampaign(mockUser, baseCampaign, {
          outreachId: 999,
        }),
      ).rejects.toThrow(NotFoundException)
      await expect(
        controller.scheduleOutreachCampaign(mockUser, baseCampaign, {
          outreachId: 999,
        }),
      ).rejects.toThrow('Outreach not found')
    })

    it('prevents accessing outreach from a different campaign (scoping)', async () => {
      mockOutreachService.model.findFirst.mockResolvedValue(null)
      const differentCampaign = { ...baseCampaign, id: 999 }

      await expect(
        controller.scheduleOutreachCampaign(mockUser, differentCampaign, {
          outreachId: 10,
        }),
      ).rejects.toThrow(NotFoundException)

      expect(mockOutreachService.model.findFirst).toHaveBeenCalledWith({
        where: { id: 10, campaignId: 999 },
        include: { voterFileFilter: true },
      })
    })
  })
})
