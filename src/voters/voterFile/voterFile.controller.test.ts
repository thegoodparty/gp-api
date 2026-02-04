import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Campaign, VoterFileFilter } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElectedOfficeService } from 'src/electedOffice/services/electedOffice.service'
import { VoterFileFilterService } from '../services/voterFileFilter.service'
import { VoterFileController } from './voterFile.controller'

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
  let mockOutreachService: Record<string, ReturnType<typeof vi.fn>>
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
    mockOutreachService = {}
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

      expect(mockElectedOfficeService.getCurrentElectedOffice).toHaveBeenCalledWith(
        campaign.userId,
      )
      expect(mockVoterFileFilterService.create).not.toHaveBeenCalled()
    })

    it('creates filter when campaign is pro', async () => {
      mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue(null)
      const campaign = { ...baseCampaign, isPro: true }
      const body = { name: 'My Filter' } as never

      const result = await controller.createVoterFileFilter(campaign, body)

      expect(mockElectedOfficeService.getCurrentElectedOffice).toHaveBeenCalledWith(
        campaign.userId,
      )
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

      expect(mockElectedOfficeService.getCurrentElectedOffice).toHaveBeenCalledWith(
        campaign.userId,
      )
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

      expect(mockElectedOfficeService.getCurrentElectedOffice).toHaveBeenCalledWith(
        campaign.userId,
      )
      expect(mockVoterFileFilterService.updateByIdAndCampaignId).not.toHaveBeenCalled()
    })

    it('updates filter when campaign is pro', async () => {
      mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue(null)
      const campaign = { ...baseCampaign, isPro: true }
      const body = { name: 'Updated Filter' } as never

      const result = await controller.updateVoterFileFilter(1, body, campaign)

      expect(mockElectedOfficeService.getCurrentElectedOffice).toHaveBeenCalledWith(
        campaign.userId,
      )
      expect(mockVoterFileFilterService.findByIdAndCampaignId).toHaveBeenCalledWith(
        1,
        campaign.id,
      )
      expect(mockVoterFileFilterService.updateByIdAndCampaignId).toHaveBeenCalledWith(
        1,
        campaign.id,
        body,
      )
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

      expect(mockElectedOfficeService.getCurrentElectedOffice).toHaveBeenCalledWith(
        campaign.userId,
      )
      expect(mockVoterFileFilterService.updateByIdAndCampaignId).toHaveBeenCalledWith(
        1,
        campaign.id,
        body,
      )
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

      expect(mockVoterFileFilterService.updateByIdAndCampaignId).not.toHaveBeenCalled()
    })
  })
})
