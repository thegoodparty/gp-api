import { BadRequestException } from '@nestjs/common'
import { of } from 'rxjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CampaignWithPathToVictory } from '../contacts.types'
import { ContactsService } from './contacts.service'

vi.mock('@nestjs/axios', () => ({
  HttpService: vi.fn(),
}))

describe('ContactsService', () => {
  let service: ContactsService
  let mockHttpService: {
    post: ReturnType<typeof vi.fn>
    get: ReturnType<typeof vi.fn>
  }
  let mockVoterFileFilterService: {
    findByIdAndCampaignId: ReturnType<typeof vi.fn>
  }
  let mockElectionsService: { cleanDistrictName: ReturnType<typeof vi.fn> }
  let mockCampaignsService: { updateJsonFields: ReturnType<typeof vi.fn> }
  let mockElectedOfficeService: {
    getCurrentElectedOffice: ReturnType<typeof vi.fn>
  }
  let mockPrismaService: {
    pollIndividualMessage: { findMany: ReturnType<typeof vi.fn> }
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
    }
    mockCampaignsService = {
      updateJsonFields: vi.fn().mockResolvedValue(undefined),
    }
    mockElectedOfficeService = {
      getCurrentElectedOffice: vi.fn().mockResolvedValue(null),
    }
    mockPrismaService = {
      pollIndividualMessage: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }

    service = new ContactsService(
      mockHttpService as never,
      mockVoterFileFilterService as never,
      mockElectionsService as never,
      mockCampaignsService as never,
      mockElectedOfficeService as never,
      mockPrismaService as never,
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
  })

  describe('getConstituentIssues', () => {
    const personId = 'person-1'
    const electedOfficeId = 'office-1'

    it('calls prisma with personId, electedOfficeId, skip, take, and include', async () => {
      mockPrismaService.pollIndividualMessage.findMany.mockResolvedValue([])

      await service.getConstituentIssues(
        personId,
        electedOfficeId,
        10,
        undefined,
      )

      expect(
        mockPrismaService.pollIndividualMessage.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            personId,
            electedOfficeId,
            sender: 'CONSTITUENT',
            pollIssues: { some: {} },
          },
          include: {
            pollIssues: true,
            poll: { select: { id: true, name: true } },
          },
          orderBy: { sentAt: 'desc' },
          skip: 0,
          take: 11,
        }),
      )
    })

    it('returns empty results and null nextCursor when no messages', async () => {
      mockPrismaService.pollIndividualMessage.findMany.mockResolvedValue([])

      const result = await service.getConstituentIssues(
        personId,
        electedOfficeId,
        10,
        undefined,
      )

      expect(result).toEqual({ nextCursor: null, results: [] })
    })

    it('flattens messages with pollIssues into ConstituentIssue results', async () => {
      const sentAt = new Date('2026-02-01T12:00:00Z')
      mockPrismaService.pollIndividualMessage.findMany.mockResolvedValue([
        {
          sentAt,
          pollIssues: [
            { title: 'Healthcare', summary: 'Cost of care' },
            { title: 'Schools', summary: 'Funding' },
          ],
          poll: { id: 'poll-1', name: 'Community Poll' },
        },
      ])

      const result = await service.getConstituentIssues(
        personId,
        electedOfficeId,
        10,
        undefined,
      )

      expect(result.results).toHaveLength(2)
      expect(result.results[0]).toEqual({
        issueTitle: 'Healthcare',
        issueSummary: 'Cost of care',
        pollTitle: 'Community Poll',
        pollId: 'poll-1',
        date: '2026-02-01T12:00:00.000Z',
      })
      expect(result.results[1]).toEqual({
        issueTitle: 'Schools',
        issueSummary: 'Funding',
        pollTitle: 'Community Poll',
        pollId: 'poll-1',
        date: '2026-02-01T12:00:00.000Z',
      })
      expect(result.nextCursor).toBeNull()
    })

    it('respects take (messages per page) and returns nextCursor when more messages exist', async () => {
      const sentAt = new Date('2026-02-01T12:00:00Z')
      mockPrismaService.pollIndividualMessage.findMany.mockResolvedValue([
        {
          sentAt,
          pollIssues: [{ title: 'A', summary: 'a' }],
          poll: { id: 'poll-1', name: 'Poll' },
        },
        {
          sentAt,
          pollIssues: [{ title: 'B', summary: 'b' }],
          poll: { id: 'poll-1', name: 'Poll' },
        },
        {
          sentAt,
          pollIssues: [{ title: 'C', summary: 'c' }],
          poll: { id: 'poll-1', name: 'Poll' },
        },
      ])

      const result = await service.getConstituentIssues(
        personId,
        electedOfficeId,
        2,
        undefined,
      )

      expect(result.results).toHaveLength(2)
      expect(result.results[0].issueTitle).toBe('A')
      expect(result.results[1].issueTitle).toBe('B')
      expect(result.nextCursor).toBe('2')
    })

    it('respects after cursor (skip) and returns next page', async () => {
      const sentAt = new Date('2026-02-01T12:00:00Z')
      mockPrismaService.pollIndividualMessage.findMany.mockResolvedValue([
        {
          sentAt,
          pollIssues: [{ title: 'C', summary: 'c' }],
          poll: { id: 'poll-1', name: 'Poll' },
        },
      ])

      const result = await service.getConstituentIssues(
        personId,
        electedOfficeId,
        2,
        '2',
      )

      expect(result.results).toHaveLength(1)
      expect(result.results[0].issueTitle).toBe('C')
      expect(result.nextCursor).toBeNull()
      expect(
        mockPrismaService.pollIndividualMessage.findMany,
      ).toHaveBeenCalledWith(expect.objectContaining({ skip: 2, take: 3 }))
    })

    it('treats invalid after as 0', async () => {
      const sentAt = new Date('2026-02-01T12:00:00Z')
      mockPrismaService.pollIndividualMessage.findMany.mockResolvedValue([
        {
          sentAt,
          pollIssues: [{ title: 'Only', summary: 'one' }],
          poll: { id: 'poll-1', name: 'Poll' },
        },
      ])

      const result = await service.getConstituentIssues(
        personId,
        electedOfficeId,
        10,
        'not-a-number',
      )

      expect(result.results).toHaveLength(1)
      expect(result.results[0].issueTitle).toBe('Only')
      expect(result.nextCursor).toBeNull()
    })
  })
})
