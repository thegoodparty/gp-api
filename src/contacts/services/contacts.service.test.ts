import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { BadRequestException } from '@nestjs/common'
import { Organization } from '@prisma/client'
import { of } from 'rxjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ContactsService } from './contacts.service'

vi.mock('@nestjs/axios', () => ({
  HttpService: vi.fn(),
}))

const SEARCH_REQUIRES_PRO_MSG = 'Search is only available for pro campaigns'
const OVERRIDE_DISTRICT_ID = 'override-district-uuid'
const POSITION_ID_FIXTURE = 'position-uuid'
const PEOPLE_V1_PATH = '/v1/people'

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
      findByIdAndOrganizationSlug: ReturnType<typeof vi.fn>
    }
    let mockElectionsService: {
      cleanDistrictName: ReturnType<typeof vi.fn>
      getPositionById: ReturnType<typeof vi.fn>
    }
    let mockCampaignsService: {
      findFirst: ReturnType<typeof vi.fn>
    }

    beforeEach(() => {
      mockHttpService = {
        post: vi
          .fn()
          .mockReturnValue(of({ data: { people: [], pagination: {} } })),
        get: vi.fn(),
      }
      mockVoterFileFilterService = {
        findByIdAndOrganizationSlug: vi.fn().mockResolvedValue(null),
      }
      mockElectionsService = {
        cleanDistrictName: vi.fn((name: string) => name),
        getPositionById: vi.fn().mockResolvedValue(null),
      }
      mockCampaignsService = {
        findFirst: vi.fn().mockResolvedValue(null),
      }

      service = new ContactsService(
        mockHttpService as never,
        mockVoterFileFilterService as never,
        mockElectionsService as never,
        mockCampaignsService as never,
        createMockLogger(),
      )
      vi.clearAllMocks()
    })

    describe('findContacts (search)', () => {
      it('throws when search is used and organization is not pro', async () => {
        const org = makeOrganization({
          slug: 'campaign-1',
          overrideDistrictId: OVERRIDE_DISTRICT_ID,
        })
        mockCampaignsService.findFirst.mockResolvedValue({ isPro: false })

        await expect(
          service.findContacts(
            { resultsPerPage: 10, page: 1, search: 'smith', segment: 'all' },
            org,
          ),
        ).rejects.toThrow(BadRequestException)
        await expect(
          service.findContacts(
            { resultsPerPage: 10, page: 1, search: 'smith', segment: 'all' },
            org,
          ),
        ).rejects.toThrow(SEARCH_REQUIRES_PRO_MSG)
      })

      it('allows search when organization is an elected office (eo- slug)', async () => {
        const org = makeOrganization({
          slug: 'eo-office-1',
          overrideDistrictId: OVERRIDE_DISTRICT_ID,
        })

        mockHttpService.post.mockReturnValue(
          of({ data: { people: [], pagination: {} } }),
        )

        await expect(
          service.findContacts(
            { resultsPerPage: 10, page: 1, search: 'smith', segment: 'all' },
            org,
          ),
        ).resolves.toBeDefined()
      })

      it('allows search when campaign is pro (isPro) even with a non-EO org', async () => {
        const org = makeOrganization({
          slug: 'campaign-1',
          overrideDistrictId: OVERRIDE_DISTRICT_ID,
        })
        mockCampaignsService.findFirst.mockResolvedValue({ isPro: true })

        mockHttpService.post.mockReturnValue(
          of({ data: { people: [], pagination: {} } }),
        )

        await expect(
          service.findContacts(
            { resultsPerPage: 10, page: 1, search: 'smith', segment: 'all' },
            org,
          ),
        ).resolves.toBeDefined()
      })

      it('does not check access when search is not provided', async () => {
        const org = makeOrganization({
          slug: 'campaign-1',
          overrideDistrictId: OVERRIDE_DISTRICT_ID,
        })

        mockHttpService.post.mockReturnValue(
          of({ data: { people: [], pagination: {} } }),
        )

        await expect(
          service.findContacts(
            {
              resultsPerPage: 10,
              page: 1,
              search: undefined,
              segment: 'all',
            },
            org,
          ),
        ).resolves.toBeDefined()
      })
    })

    describe('downloadContacts', () => {
      it('throws when organization is not pro', async () => {
        const org = makeOrganization({
          slug: 'campaign-1',
          overrideDistrictId: OVERRIDE_DISTRICT_ID,
        })
        mockCampaignsService.findFirst.mockResolvedValue({ isPro: false })
        const res = { raw: {} } as never

        await expect(
          service.downloadContacts({ segment: 'all' }, res, org),
        ).rejects.toThrow(BadRequestException)
        await expect(
          service.downloadContacts({ segment: 'all' }, res, org),
        ).rejects.toThrow('Campaign is not pro')
      })

      it('allows download when campaign is pro (isPro) even with a non-EO org', async () => {
        const org = makeOrganization({
          slug: 'campaign-1',
          overrideDistrictId: OVERRIDE_DISTRICT_ID,
        })
        mockCampaignsService.findFirst.mockResolvedValue({ isPro: true })

        const mockStream = {
          pipe: vi.fn(),
          on: vi.fn((event: string, cb: () => void) => {
            if (event === 'end') setImmediate(cb)
          }),
        }
        mockHttpService.post.mockReturnValue(of({ data: mockStream }))
        const res = { raw: {} } as never

        await expect(
          service.downloadContacts({ segment: 'all' }, res, org),
        ).resolves.toBeUndefined()
      })

      it('allows download when organization is an elected office', async () => {
        const org = makeOrganization({
          slug: 'eo-office-1',
          overrideDistrictId: OVERRIDE_DISTRICT_ID,
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
          service.downloadContacts({ segment: 'all' }, res, org),
        ).resolves.toBeUndefined()
      })
    })

    describe('organization-based district resolution', () => {
      it('uses overrideDistrictId when present on organization', async () => {
        const org = makeOrganization({
          overrideDistrictId: OVERRIDE_DISTRICT_ID,
          positionId: POSITION_ID_FIXTURE,
        })

        mockHttpService.post.mockReturnValue(
          of({ data: { people: [], pagination: {} } }),
        )

        await service.findContacts(
          { resultsPerPage: 10, page: 1, search: undefined, segment: 'all' },
          org,
        )

        expect(mockHttpService.post).toHaveBeenCalledWith(
          expect.stringContaining(PEOPLE_V1_PATH),
          expect.objectContaining({
            districtId: OVERRIDE_DISTRICT_ID,
          }),
          expect.any(Object),
        )
        expect(mockElectionsService.getPositionById).not.toHaveBeenCalled()
      })

      it('falls back to position district when overrideDistrictId is null', async () => {
        const org = makeOrganization({
          positionId: POSITION_ID_FIXTURE,
        })

        mockElectionsService.getPositionById.mockResolvedValue({
          id: POSITION_ID_FIXTURE,
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
          org,
        )

        expect(mockElectionsService.getPositionById).toHaveBeenCalledWith(
          POSITION_ID_FIXTURE,
          { includeDistrict: true },
        )
        expect(mockHttpService.post).toHaveBeenCalledWith(
          expect.stringContaining(PEOPLE_V1_PATH),
          expect.objectContaining({
            districtId: 'position-district-uuid',
          }),
          expect.any(Object),
        )
      })

      it('throws when position has no district', async () => {
        const org = makeOrganization({ positionId: POSITION_ID_FIXTURE })
        mockElectionsService.getPositionById.mockResolvedValue({
          id: POSITION_ID_FIXTURE,
          state: 'WY',
          district: null,
        })

        await expect(
          service.findContacts(
            {
              resultsPerPage: 10,
              page: 1,
              search: undefined,
              segment: 'all',
            },
            org,
          ),
        ).rejects.toThrow(
          'Organization does not have sufficient data to resolve district',
        )
      })

      it('throws when org has no positionId and no overrideDistrictId', async () => {
        const org = makeOrganization()

        await expect(
          service.findContacts(
            {
              resultsPerPage: 10,
              page: 1,
              search: undefined,
              segment: 'all',
            },
            org,
          ),
        ).rejects.toThrow(
          'Organization does not have sufficient data to resolve district',
        )
      })

      it('uses overrideDistrictId for getDistrictStats', async () => {
        const org = makeOrganization({
          overrideDistrictId: OVERRIDE_DISTRICT_ID,
        })

        mockHttpService.get.mockReturnValue(
          of({
            data: {
              districtId: OVERRIDE_DISTRICT_ID,
              totalConstituents: 500,
              buckets: {},
            },
          }),
        )

        await service.getDistrictStats(org)

        expect(mockHttpService.get).toHaveBeenCalledWith(
          expect.stringContaining(`${PEOPLE_V1_PATH}/stats`),
          expect.objectContaining({
            params: { districtId: OVERRIDE_DISTRICT_ID },
          }),
        )
      })

      it('uses overrideDistrictId for findPerson', async () => {
        const org = makeOrganization({
          overrideDistrictId: OVERRIDE_DISTRICT_ID,
        })

        mockHttpService.get.mockReturnValue(
          of({
            data: { id: 'person-1', firstName: 'Test' },
          }),
        )

        await service.findPerson('person-1', org)

        expect(mockHttpService.get).toHaveBeenCalledWith(
          expect.stringContaining(`${PEOPLE_V1_PATH}/person-1`),
          expect.objectContaining({
            params: { districtId: OVERRIDE_DISTRICT_ID },
          }),
        )
      })

      it('uses overrideDistrictId for downloadContacts', async () => {
        const org = makeOrganization({
          slug: 'eo-office-1',
          overrideDistrictId: OVERRIDE_DISTRICT_ID,
        })

        const mockStream = {
          pipe: vi.fn(),
          on: vi.fn((event: string, cb: () => void) => {
            if (event === 'end') setImmediate(cb)
          }),
        }
        mockHttpService.post.mockReturnValue(of({ data: mockStream }))
        const res = { raw: {} } as never

        await service.downloadContacts({ segment: 'all' }, res, org)

        expect(mockHttpService.post).toHaveBeenCalledWith(
          expect.stringContaining(`${PEOPLE_V1_PATH}/download`),
          expect.objectContaining({
            districtId: OVERRIDE_DISTRICT_ID,
          }),
          expect.any(Object),
        )
      })
    })

    describe('org-only path (no campaign in org)', () => {
      it('findContacts succeeds with org that has no linked campaign', async () => {
        const org = makeOrganization({
          overrideDistrictId: OVERRIDE_DISTRICT_ID,
        })
        mockCampaignsService.findFirst.mockResolvedValue(null)

        mockHttpService.post.mockReturnValue(
          of({ data: { people: [], pagination: {} } }),
        )

        await service.findContacts(
          { resultsPerPage: 10, page: 1, search: undefined, segment: 'all' },
          org,
        )

        expect(mockHttpService.post).toHaveBeenCalledWith(
          expect.stringContaining(PEOPLE_V1_PATH),
          expect.objectContaining({
            districtId: OVERRIDE_DISTRICT_ID,
          }),
          expect.any(Object),
        )
      })
    })
  })
})
