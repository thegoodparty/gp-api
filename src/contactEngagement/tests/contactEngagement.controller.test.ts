import { ElectedOffice } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ContactEngagementController } from '../contactEngagement.controller'
import { ContactEngagementService } from '../contactEngagement.service'
import {
  ConstituentActivityEventType,
  ConstituentActivityType,
} from '../contactEngagement.types'

describe('ContactEngagementController', () => {
  let controller: ContactEngagementController
  let contactEngagementService: ContactEngagementService

  beforeEach(() => {
    contactEngagementService = {
      getIndividualActivities: vi.fn(),
    } as unknown as ContactEngagementService

    controller = new ContactEngagementController(contactEngagementService)
    vi.clearAllMocks()
  })

  describe('getIndividualActivities', () => {
    const mockElectedOffice = {
      id: 'office-1',
      userId: 1,
      campaignId: 1,
      isActive: true,
      electedDate: new Date('2024-01-01'),
      swornInDate: null,
      termStartDate: null,
      termEndDate: null,
      termLengthDays: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as ElectedOffice

    const mockParams = {
      id: 'person-123',
    }
    const mockQuery = {
      type: ConstituentActivityType.POLL_INTERACTIONS,
      take: 20,
    }

    it('returns individual activities with the provided elected office', async () => {
      const mockServiceResponse = {
        nextCursor: 'last-seen-id',
        results: [
          {
            type: ConstituentActivityType.POLL_INTERACTIONS,
            date: 'myDate',
            data: {
              pollId: 'poll-id',
              pollTitle: 'poll-title',
              events: [
                {
                  type: ConstituentActivityEventType.SENT,
                  date: 'myDate',
                },
              ],
            },
          },
        ],
      }

      vi.spyOn(
        contactEngagementService,
        'getIndividualActivities',
      ).mockResolvedValue(mockServiceResponse)

      const result = await controller.getIndividualActivities(
        mockParams,
        mockQuery,
        mockElectedOffice,
      )

      expect(
        contactEngagementService.getIndividualActivities,
      ).toHaveBeenCalledWith({
        personId: 'person-123',
        type: ConstituentActivityType.POLL_INTERACTIONS,
        take: 20,
        electedOfficeId: 'office-1',
      })

      expect(result).toEqual(mockServiceResponse)
    })

    it('uses the elected office id from the decorator', async () => {
      const differentElectedOffice = {
        id: 'office-42',
        userId: 42,
        campaignId: 1,
        isActive: true,
        electedDate: new Date('2024-01-01'),
        swornInDate: null,
        termStartDate: null,
        termEndDate: null,
        termLengthDays: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ElectedOffice

      vi.spyOn(
        contactEngagementService,
        'getIndividualActivities',
      ).mockResolvedValue({ nextCursor: null, results: [] })

      await controller.getIndividualActivities(
        mockParams,
        mockQuery,
        differentElectedOffice,
      )

      expect(
        contactEngagementService.getIndividualActivities,
      ).toHaveBeenCalledWith({
        personId: 'person-123',
        type: ConstituentActivityType.POLL_INTERACTIONS,
        take: 20,
        electedOfficeId: 'office-42',
      })
    })
  })
})
