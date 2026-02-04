import { NotFoundException, NotImplementedException } from '@nestjs/common'
import { PollIndividualMessageSender } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ConstituentActivityEventType,
  ConstituentActivityType,
} from '../contacts.types'
import { IndividualActivityInput } from '../schemas/individualActivity.schema'
import { ContactsService } from './contacts.service'

describe('ContactsService', () => {
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

  describe('getIndividualActivities', () => {
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
        take: 20,
      })

      expect(result.nextCursor).toBe('msg-2')
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
          take: 50,
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

    it('returns last message id as nextCursor', async () => {
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
          pollId: 'poll-1',
          personId: 'person-123',
          sender: PollIndividualMessageSender.CONSTITUENT,
          isOptOut: false,
          sentAt: new Date('2025-01-15T12:00:00Z'),
          poll: {
            id: 'poll-1',
            name: 'Poll One',
            createdAt: new Date('2025-01-01T00:00:00Z'),
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
            name: 'Poll Two',
            createdAt: new Date('2025-01-10T00:00:00Z'),
          },
        },
      ]

      mockPollIndividualMessageService.findMany.mockResolvedValue(mockMessages)

      const result = await service.getIndividualActivities(baseInput)

      expect(result.nextCursor).toBe('msg-3')
    })
  })
})
