import {
  BadRequestException,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common'
import { PollIndividualMessageSender } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { of } from 'rxjs'
import {
  CampaignWithPathToVictory,
  ConstituentActivityEventType,
  ConstituentActivityType,
} from '../contacts.types'
import { IndividualActivityInput } from '../schemas/individualActivity.schema'
import { ContactsService } from './contacts.service'

vi.mock('@nestjs/axios', () => ({
  HttpService: vi.fn(),
}))

describe('ContactsService', () => {
  describe('getIndividualActivities', () => {
    let service: ContactsService
    let mockPollIndividualMessageService: {
      findMany: ReturnType<typeof vi.fn>
    }

    beforeEach(() => {
      mockPollIndividualMessageService = {
        findMany: vi.fn(),
      }

      service = {
        pollIndividualMessage: mockPollIndividualMessageService,
        getIndividualActivities:
          ContactsService.prototype.getIndividualActivities,
      } as unknown as ContactsService

      service.getIndividualActivities =
        service.getIndividualActivities.bind(service)

      vi.clearAllMocks()
    })

    const baseInput: IndividualActivityInput = {
      personId: 'person-123',
      type: ConstituentActivityType.POLL_INTERACTIONS,
      electedOfficeId: 'office-123',
    }

    it('returns poll interactions grouped by poll', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          pollId: 'poll-1',
          personId: 'person-123',
          sender: PollIndividualMessageSender.ELECTED_OFFICIAL,
          isOptOut: false,
          sentAt: new Date('2025-01-15T10:00:00Z'),
          poll: {
            id: 'poll-1',
            name: 'Community Survey',
            createdAt: new Date('2025-01-01T00:00:00Z'),
          },
        },
        {
          id: 'msg-2',
          pollId: 'poll-1',
          personId: 'person-123',
          sender: PollIndividualMessageSender.CONSTITUENT,
          isOptOut: false,
          sentAt: new Date('2025-01-15T12:00:00Z'),
          poll: {
            id: 'poll-1',
            name: 'Community Survey',
            createdAt: new Date('2025-01-01T00:00:00Z'),
          },
        },
      ]

      mockPollIndividualMessageService.findMany.mockResolvedValue(mockMessages)

      const result = await service.getIndividualActivities(baseInput)

      expect(mockPollIndividualMessageService.findMany).toHaveBeenCalledWith({
        where: {
          electedOfficeId: 'office-123',
          personId: 'person-123',
        },
        include: {
          poll: true,
        },
        orderBy: { sentAt: 'desc' },
        take: 21, // limit + 1 to check for more results
      })

      // No extra item returned, so nextCursor is null
      expect(result.nextCursor).toBeNull()
      expect(result.results).toHaveLength(1)
      expect(result.results[0]).toEqual({
        type: ConstituentActivityType.POLL_INTERACTIONS,
        date: '2025-01-01T00:00:00.000Z',
        data: {
          pollId: 'poll-1',
          pollTitle: 'Community Survey',
          events: [
            {
              type: ConstituentActivityEventType.SENT,
              date: '2025-01-15T10:00:00.000Z',
            },
            {
              type: ConstituentActivityEventType.RESPONDED,
              date: '2025-01-15T12:00:00.000Z',
            },
          ],
        },
      })
    })

    it('returns multiple poll activities when messages span multiple polls', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          pollId: 'poll-1',
          personId: 'person-123',
          sender: PollIndividualMessageSender.ELECTED_OFFICIAL,
          isOptOut: false,
          sentAt: new Date('2025-01-15T10:00:00Z'),
          poll: {
            id: 'poll-1',
            name: 'Poll One',
            createdAt: new Date('2025-01-01T00:00:00Z'),
          },
        },
        {
          id: 'msg-2',
          pollId: 'poll-2',
          personId: 'person-123',
          sender: PollIndividualMessageSender.ELECTED_OFFICIAL,
          isOptOut: false,
          sentAt: new Date('2025-01-20T10:00:00Z'),
          poll: {
            id: 'poll-2',
            name: 'Poll Two',
            createdAt: new Date('2025-01-10T00:00:00Z'),
          },
        },
      ]

      mockPollIndividualMessageService.findMany.mockResolvedValue(mockMessages)

      const result = await service.getIndividualActivities(baseInput)

      expect(result.results).toHaveLength(2)
      expect(result.results.map((r) => r.data.pollId)).toContain('poll-1')
      expect(result.results.map((r) => r.data.pollId)).toContain('poll-2')
    })

    it('correctly identifies opted-out events', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          pollId: 'poll-1',
          personId: 'person-123',
          sender: PollIndividualMessageSender.CONSTITUENT,
          isOptOut: true,
          sentAt: new Date('2025-01-15T10:00:00Z'),
          poll: {
            id: 'poll-1',
            name: 'Community Survey',
            createdAt: new Date('2025-01-01T00:00:00Z'),
          },
        },
      ]

      mockPollIndividualMessageService.findMany.mockResolvedValue(mockMessages)

      const result = await service.getIndividualActivities(baseInput)

      expect(result.results[0].data.events[0].type).toBe(
        ConstituentActivityEventType.OPTED_OUT,
      )
    })

    it('throws NotFoundException when no messages found', async () => {
      mockPollIndividualMessageService.findMany.mockResolvedValue([])

      await expect(service.getIndividualActivities(baseInput)).rejects.toThrow(
        NotFoundException,
      )
      await expect(service.getIndividualActivities(baseInput)).rejects.toThrow(
        'No individual messages found for that electedOffice',
      )
    })

    it('throws NotImplementedException for unsupported activity types', async () => {
      const inputWithUnsupportedType = {
        ...baseInput,
        type: 999 as ConstituentActivityType, // Unsupported type
      }

      await expect(
        service.getIndividualActivities(inputWithUnsupportedType),
      ).rejects.toThrow(NotImplementedException)
      await expect(
        service.getIndividualActivities(inputWithUnsupportedType),
      ).rejects.toThrow(
        'Only poll-interactions are supported for constituent activites',
      )
    })

    it('uses custom take value when provided', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          pollId: 'poll-1',
          personId: 'person-123',
          sender: PollIndividualMessageSender.ELECTED_OFFICIAL,
          isOptOut: false,
          sentAt: new Date('2025-01-15T10:00:00Z'),
          poll: {
            id: 'poll-1',
            name: 'Community Survey',
            createdAt: new Date('2025-01-01T00:00:00Z'),
          },
        },
      ]

      mockPollIndividualMessageService.findMany.mockResolvedValue(mockMessages)

      const inputWithTake = {
        ...baseInput,
        take: 50,
      }

      await service.getIndividualActivities(inputWithTake)

      expect(mockPollIndividualMessageService.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 51, // limit + 1 to check for more results
        }),
      )
    })

    it('uses cursor for pagination when after is provided', async () => {
      const mockMessages = [
        {
          id: 'msg-2',
          pollId: 'poll-1',
          personId: 'person-123',
          sender: PollIndividualMessageSender.ELECTED_OFFICIAL,
          isOptOut: false,
          sentAt: new Date('2025-01-15T10:00:00Z'),
          poll: {
            id: 'poll-1',
            name: 'Community Survey',
            createdAt: new Date('2025-01-01T00:00:00Z'),
          },
        },
      ]

      mockPollIndividualMessageService.findMany.mockResolvedValue(mockMessages)

      const inputWithAfter = {
        ...baseInput,
        after: 'msg-1',
      }

      await service.getIndividualActivities(inputWithAfter)

      expect(mockPollIndividualMessageService.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'msg-1' },
          skip: 1,
        }),
      )
    })

    it('returns nextCursor when more results exist', async () => {
      // With take=2, we request 3 items (limit + 1)
      // If 3 items are returned, the 3rd item's ID becomes the nextCursor
      const mockMessages = [
        {
          id: 'msg-1',
          pollId: 'poll-1',
          personId: 'person-123',
          sender: PollIndividualMessageSender.ELECTED_OFFICIAL,
          isOptOut: false,
          sentAt: new Date('2025-01-15T10:00:00Z'),
          poll: {
            id: 'poll-1',
            name: 'Poll One',
            createdAt: new Date('2025-01-01T00:00:00Z'),
          },
        },
        {
          id: 'msg-2',
          pollId: 'poll-2',
          personId: 'person-123',
          sender: PollIndividualMessageSender.ELECTED_OFFICIAL,
          isOptOut: false,
          sentAt: new Date('2025-01-15T12:00:00Z'),
          poll: {
            id: 'poll-2',
            name: 'Poll Two',
            createdAt: new Date('2025-01-05T00:00:00Z'),
          },
        },
        {
          id: 'msg-3',
          pollId: 'poll-3',
          personId: 'person-123',
          sender: PollIndividualMessageSender.ELECTED_OFFICIAL,
          isOptOut: false,
          sentAt: new Date('2025-01-20T10:00:00Z'),
          poll: {
            id: 'poll-3',
            name: 'Poll Three',
            createdAt: new Date('2025-01-10T00:00:00Z'),
          },
        },
      ]

      mockPollIndividualMessageService.findMany.mockResolvedValue(mockMessages)

      const inputWithTake = { ...baseInput, take: 2 }
      const result = await service.getIndividualActivities(inputWithTake)

      // The 3rd message (at index 2, which equals the limit) indicates more data exists
      expect(result.nextCursor).toBe('msg-3')
      // Only the first 2 messages should be processed into results (each from different polls)
      expect(result.results).toHaveLength(2)
    })

    it('returns null nextCursor when data is exhausted', async () => {
      // With take=2, we request 3 items (limit + 1)
      // If only 2 items are returned, nextCursor should be null
      const mockMessages = [
        {
          id: 'msg-1',
          pollId: 'poll-1',
          personId: 'person-123',
          sender: PollIndividualMessageSender.ELECTED_OFFICIAL,
          isOptOut: false,
          sentAt: new Date('2025-01-15T10:00:00Z'),
          poll: {
            id: 'poll-1',
            name: 'Poll One',
            createdAt: new Date('2025-01-01T00:00:00Z'),
          },
        },
        {
          id: 'msg-2',
          pollId: 'poll-2',
          personId: 'person-123',
          sender: PollIndividualMessageSender.ELECTED_OFFICIAL,
          isOptOut: false,
          sentAt: new Date('2025-01-20T10:00:00Z'),
          poll: {
            id: 'poll-2',
            name: 'Poll Two',
            createdAt: new Date('2025-01-10T00:00:00Z'),
          },
        },
      ]

      mockPollIndividualMessageService.findMany.mockResolvedValue(mockMessages)

      const inputWithTake = { ...baseInput, take: 2 }
      const result = await service.getIndividualActivities(inputWithTake)

      // No item at index 2 (the limit), so no more data exists
      expect(result.nextCursor).toBeNull()
      expect(result.results).toHaveLength(2)
    })
  })

  describe('findContacts and downloadContacts', () => {
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
    let mockPollIndividualMessageService: {
      findMany: ReturnType<typeof vi.fn>
    }
    let mockElectedOfficeService: {
      getCurrentElectedOffice: ReturnType<typeof vi.fn>
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
      mockPollIndividualMessageService = {
        findMany: vi.fn().mockResolvedValue([]),
      }
      mockElectedOfficeService = {
        getCurrentElectedOffice: vi.fn().mockResolvedValue(null),
      }

      service = new ContactsService(
        mockHttpService as never,
        mockVoterFileFilterService as never,
        mockElectionsService as never,
        mockCampaignsService as never,
        mockPollIndividualMessageService as never,
        mockElectedOfficeService as never,
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
  })
})
