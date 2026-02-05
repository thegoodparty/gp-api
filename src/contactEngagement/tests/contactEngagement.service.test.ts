import { PollIndividualMessageSender } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ConstituentActivityEventType,
  ConstituentActivityType,
} from '../contactEngagement.types'
import { IndividualActivityInput } from '../contactEngagement.schema'
import { ContactEngagementService } from '../contactEngagement.service'

describe('ContactEngagementService', () => {
  describe('getIndividualActivities', () => {
    let service: ContactEngagementService
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
          ContactEngagementService.prototype.getIndividualActivities,
      } as unknown as ContactEngagementService

      service.getIndividualActivities =
        service.getIndividualActivities.bind(service)

      vi.clearAllMocks()
    })

    const baseInput: IndividualActivityInput = {
      personId: 'person-123',
      electedOfficeId: 'office-123',
    }

    it('returns poll interactions grouped by poll', async () => {
      // Messages returned in descending order by sentAt (newest first, matching query)
      const mockMessages = [
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
      // Events should be in chronological order (oldest first)
      // Activity date is the first message's sentAt (newest first in query order)
      expect(result.results[0]).toEqual({
        type: ConstituentActivityType.POLL_INTERACTIONS,
        date: '2025-01-15T12:00:00.000Z',
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

    it('returns polls newest first with events oldest first within each poll', async () => {
      // Messages returned in descending order by sentAt (newest first, matching query)
      // Poll 2 (newer poll) has messages on Jan 20, Poll 1 (older poll) has messages on Jan 15
      const mockMessages = [
        // Poll 2's newest message first
        {
          id: 'msg-4',
          pollId: 'poll-2',
          personId: 'person-123',
          sender: PollIndividualMessageSender.CONSTITUENT,
          isOptOut: false,
          sentAt: new Date('2025-01-20T14:00:00Z'),
          poll: {
            id: 'poll-2',
            name: 'Newer Poll',
            createdAt: new Date('2025-01-18T00:00:00Z'),
          },
        },
        {
          id: 'msg-3',
          pollId: 'poll-2',
          personId: 'person-123',
          sender: PollIndividualMessageSender.ELECTED_OFFICIAL,
          isOptOut: false,
          sentAt: new Date('2025-01-20T10:00:00Z'),
          poll: {
            id: 'poll-2',
            name: 'Newer Poll',
            createdAt: new Date('2025-01-18T00:00:00Z'),
          },
        },
        // Poll 1's messages (older poll)
        {
          id: 'msg-2',
          pollId: 'poll-1',
          personId: 'person-123',
          sender: PollIndividualMessageSender.CONSTITUENT,
          isOptOut: false,
          sentAt: new Date('2025-01-15T12:00:00Z'),
          poll: {
            id: 'poll-1',
            name: 'Older Poll',
            createdAt: new Date('2025-01-01T00:00:00Z'),
          },
        },
        {
          id: 'msg-1',
          pollId: 'poll-1',
          personId: 'person-123',
          sender: PollIndividualMessageSender.ELECTED_OFFICIAL,
          isOptOut: false,
          sentAt: new Date('2025-01-15T10:00:00Z'),
          poll: {
            id: 'poll-1',
            name: 'Older Poll',
            createdAt: new Date('2025-01-01T00:00:00Z'),
          },
        },
      ]

      mockPollIndividualMessageService.findMany.mockResolvedValue(mockMessages)

      const result = await service.getIndividualActivities(baseInput)

      expect(result.results).toHaveLength(2)

      // Polls should be in order of first encounter (newest messages first = poll-2 first)
      expect(result.results[0].data.pollId).toBe('poll-2')
      expect(result.results[1].data.pollId).toBe('poll-1')

      // Events within poll-2 should be oldest first
      expect(result.results[0].data.events).toEqual([
        {
          type: ConstituentActivityEventType.SENT,
          date: '2025-01-20T10:00:00.000Z',
        },
        {
          type: ConstituentActivityEventType.RESPONDED,
          date: '2025-01-20T14:00:00.000Z',
        },
      ])

      // Events within poll-1 should be oldest first
      expect(result.results[1].data.events).toEqual([
        {
          type: ConstituentActivityEventType.SENT,
          date: '2025-01-15T10:00:00.000Z',
        },
        {
          type: ConstituentActivityEventType.RESPONDED,
          date: '2025-01-15T12:00:00.000Z',
        },
      ])
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

    it('returns empty results when no messages found', async () => {
      mockPollIndividualMessageService.findMany.mockResolvedValue([])

      const result = await service.getIndividualActivities(baseInput)

      expect(result.nextCursor).toBeNull()
      expect(result.results).toEqual([])
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
})
