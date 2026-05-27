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
      const makeMockStream = () => ({
        destroyed: false,
        pipe: vi.fn(),
        destroy: vi.fn(),
        on: vi.fn((event: string, cb: (err?: Error) => void) => {
          if (event === 'end') setImmediate(() => cb())
        }),
      })

      const makeMockReply = (headersSent = false) => {
        const flushHeaders = vi.fn()
        const setHeader = vi.fn()
        const on = vi.fn()
        return {
          flushHeaders,
          setHeader,
          on,
          res: { raw: { headersSent, flushHeaders, setHeader, on } } as never,
        }
      }

      it('throws when organization is not pro and never touches response headers', async () => {
        const org = makeOrganization({
          slug: 'campaign-1',
          overrideDistrictId: OVERRIDE_DISTRICT_ID,
        })
        mockCampaignsService.findFirst.mockResolvedValue({ isPro: false })
        const { res, flushHeaders, setHeader } = makeMockReply()

        await expect(
          service.downloadContacts({ segment: 'all' }, res, org),
        ).rejects.toThrow(BadRequestException)
        await expect(
          service.downloadContacts({ segment: 'all' }, res, org),
        ).rejects.toThrow('Campaign is not pro')

        // Critical: pre-flight failures must NOT leave Content-Disposition,
        // Set-Cookie, or a flushed 200 on the wire — otherwise the browser
        // saves the JSON error body as `contacts.csv` and the client cookie
        // poll falsely flips to "Download started".
        expect(setHeader).not.toHaveBeenCalled()
        expect(flushHeaders).not.toHaveBeenCalled()
      })

      it('throws when the upstream people-api call fails and never touches response headers', async () => {
        const org = makeOrganization({
          slug: 'eo-office-1',
          overrideDistrictId: OVERRIDE_DISTRICT_ID,
        })
        mockHttpService.post.mockImplementationOnce(() => {
          throw new Error('upstream blew up')
        })
        const { res, flushHeaders, setHeader } = makeMockReply()

        await expect(
          service.downloadContacts({ segment: 'all' }, res, org),
        ).rejects.toThrow('Failed to download contacts from people API')

        expect(setHeader).not.toHaveBeenCalled()
        expect(flushHeaders).not.toHaveBeenCalled()
      })

      it('allows download when campaign is pro (isPro) even with a non-EO org', async () => {
        const org = makeOrganization({
          slug: 'campaign-1',
          overrideDistrictId: OVERRIDE_DISTRICT_ID,
        })
        mockCampaignsService.findFirst.mockResolvedValue({ isPro: true })

        mockHttpService.post.mockReturnValue(of({ data: makeMockStream() }))
        const { res } = makeMockReply()

        await expect(
          service.downloadContacts({ segment: 'all' }, res, org),
        ).resolves.toBeUndefined()
      })

      it('allows download when organization is an elected office', async () => {
        const org = makeOrganization({
          slug: 'eo-office-1',
          overrideDistrictId: OVERRIDE_DISTRICT_ID,
        })
        mockHttpService.post.mockReturnValue(of({ data: makeMockStream() }))
        const { res } = makeMockReply()

        await expect(
          service.downloadContacts({ segment: 'all' }, res, org),
        ).resolves.toBeUndefined()
      })

      it('sets download headers (Content-Type, Content-Disposition, Set-Cookie) and flushes once the upstream stream is ready, then pipes', async () => {
        const org = makeOrganization({
          slug: 'eo-office-1',
          overrideDistrictId: OVERRIDE_DISTRICT_ID,
        })
        const mockStream = makeMockStream()
        mockHttpService.post.mockReturnValue(of({ data: mockStream }))
        const { res, flushHeaders, setHeader } = makeMockReply()

        await service.downloadContacts({ segment: 'all' }, res, org)

        expect(setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv')
        expect(setHeader).toHaveBeenCalledWith(
          'Content-Disposition',
          'attachment; filename="contacts.csv"',
        )
        // Cookie must be present, name=gp_download with a UUID value, and
        // include Secure (production hygiene) + SameSite=Lax (the cookie
        // travels on a top-level GET download navigation).
        const cookieCall = setHeader.mock.calls.find(
          (call) => call[0] === 'Set-Cookie',
        )
        expect(cookieCall).toBeDefined()
        const cookieValue = cookieCall?.[1] as string
        expect(cookieValue).toMatch(
          /^gp_download=[0-9a-f-]{36};.*Path=\/.*Max-Age=30.*SameSite=Lax.*Secure/,
        )

        expect(flushHeaders).toHaveBeenCalledTimes(1)
        expect(mockStream.pipe).toHaveBeenCalledTimes(1)
      })

      it('skips flushHeaders when headers were already sent but still pipes the body', async () => {
        const org = makeOrganization({
          slug: 'eo-office-1',
          overrideDistrictId: OVERRIDE_DISTRICT_ID,
        })
        const mockStream = makeMockStream()
        mockHttpService.post.mockReturnValue(of({ data: mockStream }))
        const { res, flushHeaders } = makeMockReply(true)

        await service.downloadContacts({ segment: 'all' }, res, org)

        // Negative + positive: an early-return regression that bails on the
        // whole pipe path can no longer pass this test.
        expect(flushHeaders).not.toHaveBeenCalled()
        expect(mockStream.pipe).toHaveBeenCalledTimes(1)
      })

      it('destroys the upstream stream when the client closes the connection mid-download', async () => {
        const org = makeOrganization({
          slug: 'eo-office-1',
          overrideDistrictId: OVERRIDE_DISTRICT_ID,
        })
        const mockStream = makeMockStream()
        // Override 'end' so the resolver isn't auto-fired; we want the
        // res.raw 'close' handler to drive resolution.
        mockStream.on = vi.fn()
        mockHttpService.post.mockReturnValue(of({ data: mockStream }))
        const { res, on: rawOn } = makeMockReply()

        const completion = service.downloadContacts(
          { segment: 'all' },
          res,
          org,
        )

        // `downloadContacts` resolves the segment + district asynchronously
        // before constructing the streaming Promise, so wait until the
        // service has wired its `'close'` listener on res.raw.
        await vi.waitFor(() => {
          expect(rawOn.mock.calls.some((call) => call[0] === 'close')).toBe(
            true,
          )
        })
        const closeCall = rawOn.mock.calls.find((call) => call[0] === 'close')
        const closeHandler = closeCall?.[1] as () => void
        closeHandler()

        await expect(completion).resolves.toBeUndefined()
        expect(mockStream.destroy).toHaveBeenCalledTimes(1)
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
          destroyed: false,
          pipe: vi.fn(),
          destroy: vi.fn(),
          on: vi.fn((event: string, cb: (err?: Error) => void) => {
            if (event === 'end') setImmediate(() => cb())
          }),
        }
        mockHttpService.post.mockReturnValue(of({ data: mockStream }))
        const res = {
          raw: {
            headersSent: false,
            flushHeaders: vi.fn(),
            setHeader: vi.fn(),
            on: vi.fn(),
          },
        } as never

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
