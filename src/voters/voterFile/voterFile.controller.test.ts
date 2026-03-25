import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Campaign, Organization, VoterFileFilter } from '@prisma/client'
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
    findByIdAndOrganizationSlug: ReturnType<typeof vi.fn>
    findByOrganizationSlug: ReturnType<typeof vi.fn>
    findByCampaignId: ReturnType<typeof vi.fn>
    updateByIdAndCampaignId: ReturnType<typeof vi.fn>
    updateByIdAndOrganizationSlug: ReturnType<typeof vi.fn>
    deleteByIdAndCampaignId: ReturnType<typeof vi.fn>
    deleteByIdAndOrganizationSlug: ReturnType<typeof vi.fn>
  }
  let mockOutreachService: {
    model: { findFirst: ReturnType<typeof vi.fn> }
  }
  let mockElectedOfficeService: {
    getCurrentElectedOffice: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
  }

  const baseCampaign = {
    id: 1,
    userId: 100,
    isPro: false,
    organizationSlug: 'campaign-1',
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
      findByIdAndOrganizationSlug: vi.fn().mockResolvedValue(mockFilter),
      findByOrganizationSlug: vi.fn().mockResolvedValue([mockFilter]),
      findByCampaignId: vi.fn().mockResolvedValue([mockFilter]),
      updateByIdAndCampaignId: vi.fn().mockResolvedValue(mockFilter),
      updateByIdAndOrganizationSlug: vi.fn().mockResolvedValue(mockFilter),
      deleteByIdAndCampaignId: vi.fn().mockResolvedValue(mockFilter),
      deleteByIdAndOrganizationSlug: vi.fn().mockResolvedValue(mockFilter),
    }
    mockOutreachService = {
      model: { findFirst: vi.fn() },
    }
    mockElectedOfficeService = {
      getCurrentElectedOffice: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
    }

    controller = new VoterFileController(
      mockVoterFileService as never,
      mockVoterOutreachService as never,
      mockVoterFileDownloadAccess as never,
      mockCampaignsService as never,
      mockVoterFileFilterService as never,
      mockOutreachService as never,
      mockElectedOfficeService as never,
      {} as never,
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
        controller.createVoterFileFilter(campaign, undefined, body),
      ).rejects.toThrow(BadRequestException)
      await expect(
        controller.createVoterFileFilter(campaign, undefined, body),
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

      const result = await controller.createVoterFileFilter(
        campaign,
        undefined,
        body,
      )

      expect(
        mockElectedOfficeService.getCurrentElectedOffice,
      ).toHaveBeenCalledWith(campaign.userId)
      expect(mockVoterFileFilterService.create).toHaveBeenCalledWith(
        campaign.id,
        campaign.organizationSlug,
        body,
      )
      expect(result).toEqual(mockFilter)
    })

    it('creates filter when user has elected office', async () => {
      const mockEO = {
        id: 'office-1',
        userId: 100,
        isActive: true,
        organizationSlug: 'eo-office-1',
      }
      mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue(mockEO)
      const campaign = { ...baseCampaign, isPro: false }
      const body = { name: 'My Filter' } as never

      const result = await controller.createVoterFileFilter(
        campaign,
        undefined,
        body,
      )

      expect(
        mockElectedOfficeService.getCurrentElectedOffice,
      ).toHaveBeenCalledWith(campaign.userId)
      expect(mockVoterFileFilterService.create).toHaveBeenCalledWith(
        campaign.id,
        campaign.organizationSlug,
        body,
      )
      expect(mockVoterFileFilterService.create).toHaveBeenCalledWith(
        campaign.id,
        mockEO.organizationSlug,
        body,
      )
      expect(mockVoterFileFilterService.create).toHaveBeenCalledTimes(2)
      expect(result).toEqual(mockFilter)
    })

    it('throws when neither campaign nor organization is provided', async () => {
      const body = { name: 'My Filter' } as never

      await expect(
        controller.createVoterFileFilter(undefined, undefined, body),
      ).rejects.toThrow('Campaign or organization is required')
    })

    it('creates filter with organization and EO access (no campaign)', async () => {
      const org = { slug: 'eo-org-1' } as Organization
      const mockEO = {
        id: 'office-1',
        organizationSlug: 'eo-org-1',
      }
      mockElectedOfficeService.findFirst.mockResolvedValue(mockEO)
      const body = { name: 'My Filter' } as never

      const result = await controller.createVoterFileFilter(
        undefined,
        org,
        body,
      )

      expect(mockElectedOfficeService.findFirst).toHaveBeenCalledWith({
        where: { organizationSlug: org.slug },
      })
      expect(mockVoterFileFilterService.create).toHaveBeenCalledWith(
        undefined,
        org.slug,
        body,
      )
      expect(result).toEqual(mockFilter)
    })

    it('throws with organization but no EO access and no campaign pro', async () => {
      const org = { slug: 'some-org' } as Organization
      mockElectedOfficeService.findFirst.mockResolvedValue(null)
      const body = { name: 'My Filter' } as never

      await expect(
        controller.createVoterFileFilter(undefined, org, body),
      ).rejects.toThrow('Campaign is not pro')
    })
  })

  describe('updateVoterFileFilter', () => {
    it('throws BadRequestException when campaign is not pro and user has no elected office', async () => {
      mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue(null)
      const campaign = { ...baseCampaign, isPro: false }
      const body = { name: 'Updated Filter' } as never

      await expect(
        controller.updateVoterFileFilter(1, body, campaign, undefined),
      ).rejects.toThrow(BadRequestException)
      await expect(
        controller.updateVoterFileFilter(1, body, campaign, undefined),
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

      const result = await controller.updateVoterFileFilter(
        1,
        body,
        campaign,
        undefined,
      )

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

      const result = await controller.updateVoterFileFilter(
        1,
        body,
        campaign,
        undefined,
      )

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
        controller.updateVoterFileFilter(1, body, campaign, undefined),
      ).rejects.toThrow(NotFoundException)
      await expect(
        controller.updateVoterFileFilter(1, body, campaign, undefined),
      ).rejects.toThrow('Voter file filter not found')

      expect(
        mockVoterFileFilterService.updateByIdAndCampaignId,
      ).not.toHaveBeenCalled()
    })

    it('throws when neither campaign nor organization is provided', async () => {
      const body = { name: 'Updated Filter' } as never

      await expect(
        controller.updateVoterFileFilter(1, body, undefined, undefined),
      ).rejects.toThrow('Campaign or organization is required')
    })

    it('updates filter with organization and EO access (no campaign)', async () => {
      const org = { slug: 'eo-org-1' } as Organization
      mockElectedOfficeService.findFirst.mockResolvedValue({
        id: 'office-1',
        organizationSlug: 'eo-org-1',
      })
      const body = { name: 'Updated Filter' } as never

      const result = await controller.updateVoterFileFilter(
        1,
        body,
        undefined,
        org,
      )

      expect(
        mockVoterFileFilterService.findByIdAndOrganizationSlug,
      ).toHaveBeenCalledWith(1, org.slug)
      expect(
        mockVoterFileFilterService.updateByIdAndOrganizationSlug,
      ).toHaveBeenCalledWith(1, org.slug, body)
      expect(result).toEqual(mockFilter)
    })

    it('throws with organization but no EO access and no campaign pro', async () => {
      const org = { slug: 'some-org' } as Organization
      mockElectedOfficeService.findFirst.mockResolvedValue(null)
      const body = { name: 'Updated Filter' } as never

      await expect(
        controller.updateVoterFileFilter(1, body, undefined, org),
      ).rejects.toThrow('Campaign is not pro')
    })
  })

  describe('listVoterFileFilters', () => {
    it('lists filters by campaign when no organization', async () => {
      const result = controller.listVoterFileFilters(baseCampaign, undefined)

      expect(
        mockVoterFileFilterService.findByCampaignId,
      ).toHaveBeenCalledWith(baseCampaign.id)
      await expect(result).resolves.toEqual([mockFilter])
    })

    it('lists filters by organization when present', async () => {
      const org = { slug: 'my-org' } as Organization

      const result = controller.listVoterFileFilters(undefined, org)

      expect(
        mockVoterFileFilterService.findByOrganizationSlug,
      ).toHaveBeenCalledWith(org.slug)
      await expect(result).resolves.toEqual([mockFilter])
    })

    it('prefers organization over campaign', () => {
      const org = { slug: 'my-org' } as Organization

      controller.listVoterFileFilters(baseCampaign, org)

      expect(
        mockVoterFileFilterService.findByOrganizationSlug,
      ).toHaveBeenCalledWith(org.slug)
      expect(
        mockVoterFileFilterService.findByCampaignId,
      ).not.toHaveBeenCalled()
    })

    it('throws when neither campaign nor organization is provided', () => {
      expect(() =>
        controller.listVoterFileFilters(undefined, undefined),
      ).toThrow('Campaign or organization is required')
    })
  })

  describe('getVoterFileFilter', () => {
    it('gets filter by campaign when no organization', async () => {
      const result = await controller.getVoterFileFilter(
        1,
        baseCampaign,
        undefined,
      )

      expect(
        mockVoterFileFilterService.findByIdAndCampaignId,
      ).toHaveBeenCalledWith(1, baseCampaign.id)
      expect(result).toEqual(mockFilter)
    })

    it('gets filter by organization when present', async () => {
      const org = { slug: 'my-org' } as Organization

      const result = await controller.getVoterFileFilter(1, undefined, org)

      expect(
        mockVoterFileFilterService.findByIdAndOrganizationSlug,
      ).toHaveBeenCalledWith(1, org.slug)
      expect(result).toEqual(mockFilter)
    })

    it('prefers organization over campaign', async () => {
      const org = { slug: 'my-org' } as Organization

      await controller.getVoterFileFilter(1, baseCampaign, org)

      expect(
        mockVoterFileFilterService.findByIdAndOrganizationSlug,
      ).toHaveBeenCalledWith(1, org.slug)
      expect(
        mockVoterFileFilterService.findByIdAndCampaignId,
      ).not.toHaveBeenCalled()
    })

    it('throws NotFoundException when filter not found', async () => {
      mockVoterFileFilterService.findByIdAndCampaignId.mockResolvedValue(null)

      await expect(
        controller.getVoterFileFilter(1, baseCampaign, undefined),
      ).rejects.toThrow('Voter file filter not found')
    })

    it('throws NotFoundException when neither campaign nor organization', async () => {
      await expect(
        controller.getVoterFileFilter(1, undefined, undefined),
      ).rejects.toThrow('Voter file filter not found')
    })
  })

  describe('deleteVoterFileFilter', () => {
    it('deletes filter by campaign when pro', async () => {
      const campaign = { ...baseCampaign, isPro: true }

      await controller.deleteVoterFileFilter(1, campaign, undefined)

      expect(
        mockVoterFileFilterService.deleteByIdAndCampaignId,
      ).toHaveBeenCalledWith(1, campaign.id)
    })

    it('deletes filter by campaign when user has elected office', async () => {
      mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue({
        id: 'office-1',
        userId: 100,
        isActive: true,
      })

      await controller.deleteVoterFileFilter(1, baseCampaign, undefined)

      expect(
        mockVoterFileFilterService.deleteByIdAndCampaignId,
      ).toHaveBeenCalledWith(1, baseCampaign.id)
    })

    it('throws when campaign is not pro and no elected office', async () => {
      mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue(null)

      await expect(
        controller.deleteVoterFileFilter(1, baseCampaign, undefined),
      ).rejects.toThrow('Campaign is not pro')

      expect(
        mockVoterFileFilterService.deleteByIdAndCampaignId,
      ).not.toHaveBeenCalled()
    })

    it('deletes filter by organization with EO access', async () => {
      const org = { slug: 'eo-org-1' } as Organization
      mockElectedOfficeService.findFirst.mockResolvedValue({
        id: 'office-1',
        organizationSlug: 'eo-org-1',
      })

      await controller.deleteVoterFileFilter(1, undefined, org)

      expect(
        mockVoterFileFilterService.deleteByIdAndOrganizationSlug,
      ).toHaveBeenCalledWith(1, org.slug)
    })

    it('throws with organization but no EO access and no campaign pro', async () => {
      const org = { slug: 'some-org' } as Organization
      mockElectedOfficeService.findFirst.mockResolvedValue(null)

      await expect(
        controller.deleteVoterFileFilter(1, undefined, org),
      ).rejects.toThrow('Campaign is not pro')

      expect(
        mockVoterFileFilterService.deleteByIdAndOrganizationSlug,
      ).not.toHaveBeenCalled()
    })

    it('prefers organization over campaign', async () => {
      const org = { slug: 'eo-org-1' } as Organization
      mockElectedOfficeService.findFirst.mockResolvedValue({
        id: 'office-1',
        organizationSlug: 'eo-org-1',
      })

      await controller.deleteVoterFileFilter(1, baseCampaign, org)

      expect(
        mockVoterFileFilterService.deleteByIdAndOrganizationSlug,
      ).toHaveBeenCalledWith(1, org.slug)
      expect(
        mockVoterFileFilterService.deleteByIdAndCampaignId,
      ).not.toHaveBeenCalled()
    })

    it('throws when neither campaign nor organization is provided', async () => {
      await expect(
        controller.deleteVoterFileFilter(1, undefined, undefined),
      ).rejects.toThrow('Campaign or organization is required')
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
