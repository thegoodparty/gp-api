import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { BadRequestException } from '@nestjs/common'
import { Organization } from '@prisma/client'
import { of } from 'rxjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CampaignWithPathToVictory } from '../contacts.types'
import { ContactsService } from './contacts.service'

vi.mock('@nestjs/axios', () => ({
  HttpService: vi.fn(),
}))

const makeOrganization = (
  overrides: Partial<Organization> = {},
): Organization =>
  ({
    slug: 'campaign-1',
    ownerId: 100,
    positionId: null,
    overrideDistrictId: null,
    customPositionName: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Organization

describe('ContactsService', () => {
  describe('findContacts and downloadContacts', () => {
    let service: ContactsService
    let mockHttpService: {
      post: ReturnType<typeof vi.fn>
      get: ReturnType<typeof vi.fn>
    }
    let mockVoterFileFilterService: {
      findByIdAndCampaignId: ReturnType<typeof vi.fn>
    }
    let mockElectionsService: {
      cleanDistrictName: ReturnType<typeof vi.fn>
      getPositionById: ReturnType<typeof vi.fn>
    }
    let mockCampaignsService: { updateJsonFields: ReturnType<typeof vi.fn> }
    let mockElectedOfficeService: {
      getCurrentElectedOffice: ReturnType<typeof vi.fn>
      findFirst: ReturnType<typeof vi.fn>
    }

    const baseCampaign = {
      id: 1,
      userId: 100,
      isPro: false,
      details: { state: 'NC' },
      pathToVictory: {
        data: { electionType: 'district', electionLocation: 'District 1' },
      },
    } as unknown as CampaignWithPathToVictory

    beforeEach(() => {
      mockHttpService = {
        post: vi
          .fn()
          .mockReturnValue(of({ data: { people: [], pagination: {} } })),
        get: vi.fn(),
      }
      mockVoterFileFilterService = {
        findByIdAndCampaignId: vi.fn().mockResolvedValue(null),
      }
      mockElectionsService = {
        cleanDistrictName: vi.fn((name: string) => name),
        getPositionById: vi.fn().mockResolvedValue(null),
      }
      mockCampaignsService = {
        updateJsonFields: vi.fn().mockResolvedValue(undefined),
      }
      mockElectedOfficeService = {
        getCurrentElectedOffice: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
      }

      service = new ContactsService(
        mockHttpService as never,
        mockVoterFileFilterService as never,
        mockElectionsService as never,
        mockCampaignsService as never,
        mockElectedOfficeService as never,
        createMockLogger(),
      )
      vi.clearAllMocks()
    })

    describe('findContacts (search)', () => {
      it('throws BadRequestException when search is used and campaign is not pro and user has no elected office', async () => {
        mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue(null)
        const campaign = { ...baseCampaign, isPro: false }

        await expect(
          service.findContacts(
            { resultsPerPage: 10, page: 1, search: 'smith', segment: 'all' },
            campaign,
          ),
        ).rejects.toThrow(BadRequestException)
        await expect(
          service.findContacts(
            { resultsPerPage: 10, page: 1, search: 'smith', segment: 'all' },
            campaign,
          ),
        ).rejects.toThrow('Search is only available for pro campaigns')

        expect(
          mockElectedOfficeService.getCurrentElectedOffice,
        ).toHaveBeenCalledWith(campaign.userId)
      })

      it('does not throw when search is used and campaign is pro', async () => {
        mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue(null)
        const campaign = { ...baseCampaign, isPro: true }

        await expect(
          service.findContacts(
            { resultsPerPage: 10, page: 1, search: 'smith', segment: 'all' },
            campaign,
          ),
        ).resolves.toBeDefined()

        expect(
          mockElectedOfficeService.getCurrentElectedOffice,
        ).toHaveBeenCalledWith(campaign.userId)
      })

      it('does not throw when search is used and user has elected office', async () => {
        mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue({
          id: 'office-1',
          userId: 100,
          isActive: true,
        })
        const campaign = { ...baseCampaign, isPro: false }

        await expect(
          service.findContacts(
            { resultsPerPage: 10, page: 1, search: 'smith', segment: 'all' },
            campaign,
          ),
        ).resolves.toBeDefined()

        expect(
          mockElectedOfficeService.getCurrentElectedOffice,
        ).toHaveBeenCalledWith(campaign.userId)
      })

      it('uses findFirst with organizationSlug check when organization is provided', async () => {
        mockElectedOfficeService.findFirst.mockResolvedValue({
          id: 'office-1',
          userId: 100,
          organizationSlug: 'eo-office-1',
        })
        const campaign = { ...baseCampaign, isPro: false }
        const org = makeOrganization({
          overrideDistrictId: 'override-district-uuid',
        })

        await expect(
          service.findContacts(
            { resultsPerPage: 10, page: 1, search: 'smith', segment: 'all' },
            campaign,
            org,
          ),
        ).resolves.toBeDefined()

        expect(mockElectedOfficeService.findFirst).toHaveBeenCalledWith({
          where: { organizationSlug: org.slug },
        })
        expect(
          mockElectedOfficeService.getCurrentElectedOffice,
        ).not.toHaveBeenCalled()
      })

      it('throws when search is used with organization and user has no org-linked elected office', async () => {
        mockElectedOfficeService.findFirst.mockResolvedValue(null)
        const campaign = { ...baseCampaign, isPro: false }
        const org = makeOrganization({
          overrideDistrictId: 'override-district-uuid',
        })

        await expect(
          service.findContacts(
            { resultsPerPage: 10, page: 1, search: 'smith', segment: 'all' },
            campaign,
            org,
          ),
        ).rejects.toThrow('Search is only available for pro campaigns')

        expect(mockElectedOfficeService.findFirst).toHaveBeenCalledWith({
          where: { organizationSlug: org.slug },
        })
        expect(
          mockElectedOfficeService.getCurrentElectedOffice,
        ).not.toHaveBeenCalled()
      })
    })

    describe('downloadContacts', () => {
      it('throws BadRequestException when campaign is not pro and user has no elected office', async () => {
        mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue(null)
        const campaign = { ...baseCampaign, isPro: false }
        const res = { raw: {} } as never

        await expect(
          service.downloadContacts({ segment: 'all' }, campaign, res),
        ).rejects.toThrow(BadRequestException)
        await expect(
          service.downloadContacts({ segment: 'all' }, campaign, res),
        ).rejects.toThrow('Campaign is not pro')

        expect(
          mockElectedOfficeService.getCurrentElectedOffice,
        ).toHaveBeenCalledWith(campaign.userId)
      })

      it('does not throw when campaign is pro', async () => {
        mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue(null)
        const campaign = { ...baseCampaign, isPro: true }
        const mockStream = {
          pipe: vi.fn(),
          on: vi.fn((event: string, cb: () => void) => {
            if (event === 'end') setImmediate(cb)
          }),
        }
        mockHttpService.post.mockReturnValue(of({ data: mockStream }))
        const res = { raw: {} } as never

        await expect(
          service.downloadContacts({ segment: 'all' }, campaign, res),
        ).resolves.toBeUndefined()

        expect(
          mockElectedOfficeService.getCurrentElectedOffice,
        ).toHaveBeenCalledWith(campaign.userId)
      })

      it('does not throw when user has elected office', async () => {
        mockElectedOfficeService.getCurrentElectedOffice.mockResolvedValue({
          id: 'office-1',
          userId: 100,
          isActive: true,
        })
        const campaign = { ...baseCampaign, isPro: false }
        const mockStream = {
          pipe: vi.fn(),
          on: vi.fn((event: string, cb: () => void) => {
            if (event === 'end') setImmediate(cb)
          }),
        }
        mockHttpService.post.mockReturnValue(of({ data: mockStream }))
        const res = { raw: {} } as never

        await expect(
          service.downloadContacts({ segment: 'all' }, campaign, res),
        ).resolves.toBeUndefined()

        expect(
          mockElectedOfficeService.getCurrentElectedOffice,
        ).toHaveBeenCalledWith(campaign.userId)
      })

      it('uses findFirst with organizationSlug check when organization is provided', async () => {
        mockElectedOfficeService.findFirst.mockResolvedValue({
          id: 'office-1',
          userId: 100,
          organizationSlug: 'eo-office-1',
        })
        const campaign = { ...baseCampaign, isPro: false }
        const org = makeOrganization({
          overrideDistrictId: 'override-district-uuid',
        })
        const mockStream = {
          pipe: vi.fn(),
          on: vi.fn((event: string, cb: () => void) => {
            if (event === 'end') setImmediate(cb)
          }),
        }
        mockHttpService.post.mockReturnValue(of({ data: mockStream }))
        const res = { raw: {} } as never

        await expect(
          service.downloadContacts({ segment: 'all' }, campaign, res, org),
        ).resolves.toBeUndefined()

        expect(mockElectedOfficeService.findFirst).toHaveBeenCalledWith({
          where: { organizationSlug: org.slug },
        })
        expect(
          mockElectedOfficeService.getCurrentElectedOffice,
        ).not.toHaveBeenCalled()
      })

      it('throws when organization is provided but user has no org-linked elected office', async () => {
        mockElectedOfficeService.findFirst.mockResolvedValue(null)
        const campaign = { ...baseCampaign, isPro: false }
        const org = makeOrganization({
          overrideDistrictId: 'override-district-uuid',
        })
        const res = { raw: {} } as never

        await expect(
          service.downloadContacts({ segment: 'all' }, campaign, res, org),
        ).rejects.toThrow('Campaign is not pro')

        expect(mockElectedOfficeService.findFirst).toHaveBeenCalledWith({
          where: { organizationSlug: org.slug },
        })
        expect(
          mockElectedOfficeService.getCurrentElectedOffice,
        ).not.toHaveBeenCalled()
      })
    })

    describe('getDistrictStats', () => {
      it('allows statewide fallback (state only) when campaign is approved for statewide contacts', async () => {
        const campaign = {
          ...baseCampaign,
          canDownloadFederal: true,
          details: { state: 'WY', ballotLevel: 'STATE' },
          pathToVictory: {
            data: { electionType: 'State', electionLocation: 'WY' },
          },
        } as unknown as CampaignWithPathToVictory

        mockHttpService.get.mockReturnValue(
          of({
            data: {
              districtId: 'statewide-wy',
              totalConstituents: 1000,
              buckets: {},
            },
          }),
        )

        await expect(service.getDistrictStats(campaign)).resolves.toBeDefined()
        expect(mockHttpService.get).toHaveBeenCalledWith(
          expect.stringContaining('/v1/people/stats'),
          expect.objectContaining({
            params: { state: 'WY' },
          }),
        )
      })
    })

    describe('organization-based district resolution', () => {
      it('uses overrideDistrictId when present on organization', async () => {
        const org = makeOrganization({
          overrideDistrictId: 'override-district-uuid',
          positionId: 'position-uuid',
        })

        mockHttpService.post.mockReturnValue(
          of({ data: { people: [], pagination: {} } }),
        )

        await service.findContacts(
          { resultsPerPage: 10, page: 1, search: undefined, segment: 'all' },
          baseCampaign,
          org,
        )

        expect(mockHttpService.post).toHaveBeenCalledWith(
          expect.stringContaining('/v1/people'),
          expect.objectContaining({
            districtId: 'override-district-uuid',
          }),
          expect.any(Object),
        )
        // Should not call getPositionById since overrideDistrictId takes priority
        expect(mockElectionsService.getPositionById).not.toHaveBeenCalled()
      })

      it('falls back to position district when overrideDistrictId is null', async () => {
        const org = makeOrganization({
          positionId: 'position-uuid',
        })

        mockElectionsService.getPositionById.mockResolvedValue({
          id: 'position-uuid',
          district: {
            id: 'position-district-uuid',
            L2DistrictType: 'State_Senate',
            L2DistrictName: 'District 1',
          },
        })
        mockHttpService.post.mockReturnValue(
          of({ data: { people: [], pagination: {} } }),
        )

        await service.findContacts(
          { resultsPerPage: 10, page: 1, search: undefined, segment: 'all' },
          baseCampaign,
          org,
        )

        expect(mockElectionsService.getPositionById).toHaveBeenCalledWith(
          'position-uuid',
          { includeDistrict: true },
        )
        expect(mockHttpService.post).toHaveBeenCalledWith(
          expect.stringContaining('/v1/people'),
          expect.objectContaining({
            districtId: 'position-district-uuid',
          }),
          expect.any(Object),
        )
      })

      it('falls back to state-only when position has no district and campaign is approved for statewide', async () => {
        const org = makeOrganization({ positionId: 'position-uuid' })
        mockElectionsService.getPositionById.mockResolvedValue({
          id: 'position-uuid',
          district: null,
        })
        const statewideCampaign = {
          ...baseCampaign,
          canDownloadFederal: true,
          details: { state: 'WY', ballotLevel: 'STATE' },
        } as unknown as CampaignWithPathToVictory

        mockHttpService.post.mockReturnValue(
          of({ data: { people: [], pagination: {} } }),
        )

        await service.findContacts(
          { resultsPerPage: 10, page: 1, search: undefined, segment: 'all' },
          statewideCampaign,
          org,
        )

        expect(mockElectionsService.getPositionById).toHaveBeenCalledWith(
          'position-uuid',
          { includeDistrict: true },
        )
        expect(mockHttpService.post).toHaveBeenCalledWith(
          expect.stringContaining('/v1/people'),
          expect.objectContaining({ state: 'WY' }),
          expect.any(Object),
        )
        const callBody = mockHttpService.post.mock.calls[0][1] as Record<
          string,
          unknown
        >
        expect(callBody.districtId).toBeUndefined()
      })

      it('falls back to state-only when org has no district and campaign is approved for statewide', async () => {
        const org = makeOrganization()
        const statewideCampaign = {
          ...baseCampaign,
          canDownloadFederal: true,
          details: { state: 'WY', ballotLevel: 'STATE' },
        } as unknown as CampaignWithPathToVictory

        mockHttpService.post.mockReturnValue(
          of({ data: { people: [], pagination: {} } }),
        )

        await service.findContacts(
          { resultsPerPage: 10, page: 1, search: undefined, segment: 'all' },
          statewideCampaign,
          org,
        )

        expect(mockHttpService.post).toHaveBeenCalledWith(
          expect.stringContaining('/v1/people'),
          expect.objectContaining({
            state: 'WY',
          }),
          expect.any(Object),
        )
        // Should not include districtId
        const callBody = mockHttpService.post.mock.calls[0][1] as Record<
          string,
          unknown
        >
        expect(callBody.districtId).toBeUndefined()
      })

      it('throws when org has no district and campaign is not approved for statewide', async () => {
        const org = makeOrganization()

        await expect(
          service.findContacts(
            {
              resultsPerPage: 10,
              page: 1,
              search: undefined,
              segment: 'all',
            },
            baseCampaign,
            org,
          ),
        ).rejects.toThrow(BadRequestException)
      })

      it('uses legacy campaign path when organization is undefined', async () => {
        mockHttpService.post.mockReturnValue(
          of({ data: { people: [], pagination: {} } }),
        )

        await service.findContacts(
          { resultsPerPage: 10, page: 1, search: undefined, segment: 'all' },
          baseCampaign,
          undefined,
        )

        // Legacy path uses state + districtType + districtName from campaign
        expect(mockHttpService.post).toHaveBeenCalledWith(
          expect.stringContaining('/v1/people'),
          expect.objectContaining({
            state: 'NC',
            districtType: 'district',
            districtName: 'District 1',
          }),
          expect.any(Object),
        )
      })

      it('uses overrideDistrictId for getDistrictStats with organization', async () => {
        const org = makeOrganization({
          overrideDistrictId: 'override-district-uuid',
        })

        mockHttpService.get.mockReturnValue(
          of({
            data: {
              districtId: 'override-district-uuid',
              totalConstituents: 500,
              buckets: {},
            },
          }),
        )

        await service.getDistrictStats(baseCampaign, org)

        expect(mockHttpService.get).toHaveBeenCalledWith(
          expect.stringContaining('/v1/people/stats'),
          expect.objectContaining({
            params: { districtId: 'override-district-uuid' },
          }),
        )
      })

      it('uses overrideDistrictId for findPerson with organization', async () => {
        const org = makeOrganization({
          overrideDistrictId: 'override-district-uuid',
        })

        mockHttpService.get.mockReturnValue(
          of({
            data: { id: 'person-1', firstName: 'Test' },
          }),
        )

        await service.findPerson('person-1', baseCampaign, org)

        expect(mockHttpService.get).toHaveBeenCalledWith(
          expect.stringContaining('/v1/people/person-1'),
          expect.objectContaining({
            params: { districtId: 'override-district-uuid' },
          }),
        )
      })

      it('uses overrideDistrictId for downloadContacts with organization', async () => {
        const org = makeOrganization({
          overrideDistrictId: 'override-district-uuid',
        })
        const campaign = { ...baseCampaign, isPro: true }

        const mockStream = {
          pipe: vi.fn(),
          on: vi.fn((event: string, cb: () => void) => {
            if (event === 'end') setImmediate(cb)
          }),
        }
        mockHttpService.post.mockReturnValue(of({ data: mockStream }))
        const res = { raw: {} } as never

        await service.downloadContacts({ segment: 'all' }, campaign, res, org)

        expect(mockHttpService.post).toHaveBeenCalledWith(
          expect.stringContaining('/v1/people/download'),
          expect.objectContaining({
            districtId: 'override-district-uuid',
          }),
          expect.any(Object),
        )
      })
    })
  })
})
