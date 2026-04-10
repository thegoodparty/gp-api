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
    findFirst: ReturnType<typeof vi.fn>
  }

  const baseCampaign = {
    id: 1,
    userId: 100,
    isPro: false,
    organizationSlug: 'campaign-1',
  } as Campaign

  const baseOrg = { slug: 'campaign-1' } as Organization

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
    it('throws when campaign is not pro and org has no elected office', async () => {
      mockElectedOfficeService.findFirst.mockResolvedValue(null)
      const body = { name: 'My Filter' } as never

      await expect(
        controller.createVoterFileFilter(baseCampaign, baseOrg, body),
      ).rejects.toThrow(BadRequestException)
      await expect(
        controller.createVoterFileFilter(baseCampaign, baseOrg, body),
      ).rejects.toThrow('Campaign is not pro')

      expect(mockElectedOfficeService.findFirst).toHaveBeenCalledWith({
        where: { organizationSlug: baseOrg.slug },
      })
    })

    it('creates filter when campaign is pro', async () => {
      const campaign = { ...baseCampaign, isPro: true }
      const body = { name: 'My Filter' } as never

      const result = await controller.createVoterFileFilter(
        campaign,
        baseOrg,
        body,
      )

      expect(mockVoterFileFilterService.create).toHaveBeenCalledWith(
        campaign.id,
        baseOrg.slug,
        body,
      )
      expect(result).toEqual(mockFilter)
    })

    it('creates filter when org has elected office access', async () => {
      const org = { slug: 'eo-org-1' } as Organization
      mockElectedOfficeService.findFirst.mockResolvedValue({
        id: 'office-1',
        organizationSlug: 'eo-org-1',
      })
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
  })

  describe('listVoterFileFilters', () => {
    it('lists filters by organization slug', async () => {
      const result = controller.listVoterFileFilters(baseOrg)

      expect(
        mockVoterFileFilterService.findByOrganizationSlug,
      ).toHaveBeenCalledWith(baseOrg.slug)
      await expect(result).resolves.toEqual([mockFilter])
    })
  })

  describe('getVoterFileFilter', () => {
    it('gets filter by organization slug', async () => {
      const result = await controller.getVoterFileFilter(1, baseOrg)

      expect(
        mockVoterFileFilterService.findByIdAndOrganizationSlug,
      ).toHaveBeenCalledWith(1, baseOrg.slug)
      expect(result).toEqual(mockFilter)
    })

    it('throws NotFoundException when filter not found', async () => {
      mockVoterFileFilterService.findByIdAndOrganizationSlug.mockResolvedValue(
        null,
      )

      await expect(controller.getVoterFileFilter(1, baseOrg)).rejects.toThrow(
        'Voter file filter not found',
      )
    })
  })

  describe('updateVoterFileFilter', () => {
    it('throws when campaign is not pro and org has no elected office', async () => {
      mockElectedOfficeService.findFirst.mockResolvedValue(null)
      const body = { name: 'Updated Filter' } as never

      await expect(
        controller.updateVoterFileFilter(1, body, baseCampaign, baseOrg),
      ).rejects.toThrow(BadRequestException)
      await expect(
        controller.updateVoterFileFilter(1, body, baseCampaign, baseOrg),
      ).rejects.toThrow('Campaign is not pro')
    })

    it('updates filter with organization and EO access', async () => {
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

    it('throws NotFoundException when filter not found', async () => {
      const org = { slug: 'eo-org-1' } as Organization
      mockElectedOfficeService.findFirst.mockResolvedValue({
        id: 'office-1',
      })
      mockVoterFileFilterService.findByIdAndOrganizationSlug.mockResolvedValue(
        null,
      )
      const body = { name: 'Updated Filter' } as never

      await expect(
        controller.updateVoterFileFilter(1, body, undefined, org),
      ).rejects.toThrow('Voter file filter not found')
    })
  })

  describe('deleteVoterFileFilter', () => {
    it('deletes filter with EO access', async () => {
      const org = { slug: 'eo-org-1' } as Organization
      mockElectedOfficeService.findFirst.mockResolvedValue({
        id: 'office-1',
        organizationSlug: 'eo-org-1',
      })

      await controller.deleteVoterFileFilter(1, baseCampaign, org)

      expect(
        mockVoterFileFilterService.deleteByIdAndOrganizationSlug,
      ).toHaveBeenCalledWith(1, org.slug)
    })

    it('throws when no EO access and not pro', async () => {
      const org = { slug: 'some-org' } as Organization
      mockElectedOfficeService.findFirst.mockResolvedValue(null)

      await expect(
        controller.deleteVoterFileFilter(1, baseCampaign, org),
      ).rejects.toThrow('Campaign is not pro')

      expect(
        mockVoterFileFilterService.deleteByIdAndOrganizationSlug,
      ).not.toHaveBeenCalled()
    })

    it('deletes when campaign is pro', async () => {
      const campaign = { ...baseCampaign, isPro: true }
      mockElectedOfficeService.findFirst.mockResolvedValue(null)

      await controller.deleteVoterFileFilter(1, campaign, baseOrg)

      expect(
        mockVoterFileFilterService.deleteByIdAndOrganizationSlug,
      ).toHaveBeenCalledWith(1, baseOrg.slug)
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
  })
})
