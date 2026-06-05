import { BadRequestException } from '@nestjs/common'
import { Organization, VoterFileFilter } from '../../generated/prisma'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VoterFileController } from './voterFile.controller'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'

describe('VoterFileController', () => {
  let controller: VoterFileController
  let mockVoterFileService: Record<string, ReturnType<typeof vi.fn>>
  let mockVoterFileDownloadAccess: Record<string, ReturnType<typeof vi.fn>>
  let mockCampaignsService: Record<string, ReturnType<typeof vi.fn>>
  let mockVoterFileFilterService: {
    create: ReturnType<typeof vi.fn>
    filterAccessCheck: ReturnType<typeof vi.fn>
    findByIdAndOrganizationSlug: ReturnType<typeof vi.fn>
    findByOrganizationSlug: ReturnType<typeof vi.fn>
    updateByIdAndOrganizationSlug: ReturnType<typeof vi.fn>
    deleteByIdAndOrganizationSlug: ReturnType<typeof vi.fn>
  }

  const baseOrg = { slug: 'campaign-1' } as Organization

  const mockFilter = {
    id: 1,
    name: 'Test Filter',
  } as VoterFileFilter

  beforeEach(() => {
    mockVoterFileService = {}
    mockVoterFileDownloadAccess = {}
    mockCampaignsService = {}
    mockVoterFileFilterService = {
      create: vi.fn().mockResolvedValue(mockFilter),
      filterAccessCheck: vi.fn().mockResolvedValue(undefined),
      findByIdAndOrganizationSlug: vi.fn().mockResolvedValue(mockFilter),
      findByOrganizationSlug: vi.fn().mockResolvedValue([mockFilter]),
      updateByIdAndOrganizationSlug: vi.fn().mockResolvedValue(mockFilter),
      deleteByIdAndOrganizationSlug: vi.fn().mockResolvedValue(mockFilter),
    }

    controller = new VoterFileController(
      mockVoterFileService as never,
      mockVoterFileDownloadAccess as never,
      mockCampaignsService as never,
      mockVoterFileFilterService as never,
      {} as never,
      createMockLogger(),
    )
    vi.clearAllMocks()
  })

  describe('createVoterFileFilter', () => {
    it('throws when filterAccessCheck rejects', async () => {
      mockVoterFileFilterService.filterAccessCheck.mockRejectedValue(
        new BadRequestException('Campaign is not pro'),
      )
      const body = { name: 'My Filter' } as never

      await expect(
        controller.createVoterFileFilter(baseOrg, body),
      ).rejects.toThrow(BadRequestException)

      expect(mockVoterFileFilterService.filterAccessCheck).toHaveBeenCalledWith(
        baseOrg.slug,
      )
      expect(mockVoterFileFilterService.create).not.toHaveBeenCalled()
    })

    it('creates filter when access check passes', async () => {
      const body = { name: 'My Filter' } as never

      const result = await controller.createVoterFileFilter(baseOrg, body)

      expect(mockVoterFileFilterService.filterAccessCheck).toHaveBeenCalledWith(
        baseOrg.slug,
      )
      expect(mockVoterFileFilterService.create).toHaveBeenCalledWith(
        baseOrg.slug,
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
    it('throws when filterAccessCheck rejects', async () => {
      mockVoterFileFilterService.filterAccessCheck.mockRejectedValue(
        new BadRequestException('Campaign is not pro'),
      )
      const body = { name: 'Updated Filter' } as never

      await expect(
        controller.updateVoterFileFilter(1, body, baseOrg),
      ).rejects.toThrow('Campaign is not pro')
    })

    it('updates filter when access check passes', async () => {
      const body = { name: 'Updated Filter' } as never

      const result = await controller.updateVoterFileFilter(1, body, baseOrg)

      expect(mockVoterFileFilterService.filterAccessCheck).toHaveBeenCalledWith(
        baseOrg.slug,
      )
      expect(
        mockVoterFileFilterService.findByIdAndOrganizationSlug,
      ).toHaveBeenCalledWith(1, baseOrg.slug)
      expect(
        mockVoterFileFilterService.updateByIdAndOrganizationSlug,
      ).toHaveBeenCalledWith(1, baseOrg.slug, body)
      expect(result).toEqual(mockFilter)
    })

    it('throws NotFoundException when filter not found', async () => {
      mockVoterFileFilterService.findByIdAndOrganizationSlug.mockResolvedValue(
        null,
      )
      const body = { name: 'Updated Filter' } as never

      await expect(
        controller.updateVoterFileFilter(1, body, baseOrg),
      ).rejects.toThrow('Voter file filter not found')
    })
  })

  describe('deleteVoterFileFilter', () => {
    it('deletes filter when access check passes', async () => {
      await controller.deleteVoterFileFilter(1, baseOrg)

      expect(mockVoterFileFilterService.filterAccessCheck).toHaveBeenCalledWith(
        baseOrg.slug,
      )
      expect(
        mockVoterFileFilterService.deleteByIdAndOrganizationSlug,
      ).toHaveBeenCalledWith(1, baseOrg.slug)
    })

    it('throws when filterAccessCheck rejects', async () => {
      mockVoterFileFilterService.filterAccessCheck.mockRejectedValue(
        new BadRequestException('Campaign is not pro'),
      )

      await expect(
        controller.deleteVoterFileFilter(1, baseOrg),
      ).rejects.toThrow('Campaign is not pro')

      expect(
        mockVoterFileFilterService.deleteByIdAndOrganizationSlug,
      ).not.toHaveBeenCalled()
    })
  })
})
