import { ForbiddenException } from '@nestjs/common'
import { User } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ContactsController } from './contacts.controller'
import {
  ConstituentActivityEventType,
  ConstituentActivityType,
} from './contacts.types'
import { ContactsService } from './services/contacts.service'
import { ElectedOfficeService } from '@/electedOffice/services/electedOffice.service'

describe('ContactsController', () => {
  let controller: ContactsController
  let contactsService: ContactsService
  let electedOfficeService: ElectedOfficeService

  beforeEach(() => {
    contactsService = {
      getIndividualActivities: vi.fn(),
    } as unknown as ContactsService

    electedOfficeService = {
      getCurrentElectedOffice: vi.fn(),
    } as unknown as ElectedOfficeService

    controller = new ContactsController(contactsService, electedOfficeService)
    vi.clearAllMocks()
  })

  describe('getIndividualActivities', () => {
    const mockUser = { id: 1 } as User
    const mockParams = {
      id: 'person-123',
    }
    const mockQuery = {
      type: ConstituentActivityType.POLL_INTERACTIONS,
      take: 20,
    }

    it('returns individual activities when user has an elected office', async () => {
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
      }

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
        electedOfficeService,
        'getCurrentElectedOffice',
      ).mockResolvedValue(mockElectedOffice)

      vi.spyOn(contactsService, 'getIndividualActivities').mockResolvedValue(
        mockServiceResponse,
      )

      const result = await controller.getIndividualActivities(
        mockParams,
        mockQuery,
        mockUser,
      )

      expect(electedOfficeService.getCurrentElectedOffice).toHaveBeenCalledWith(
        1,
      )

      expect(contactsService.getIndividualActivities).toHaveBeenCalledWith({
        personId: 'person-123',
        type: ConstituentActivityType.POLL_INTERACTIONS,
        take: 20,
        electedOfficeId: 'office-1',
      })

      expect(result).toEqual(mockServiceResponse)
    })

    it('throws ForbiddenException when user has no elected office', async () => {
      vi.spyOn(
        electedOfficeService,
        'getCurrentElectedOffice',
      ).mockResolvedValue(null)

      await expect(
        controller.getIndividualActivities(mockParams, mockQuery, mockUser),
      ).rejects.toThrow(ForbiddenException)

      await expect(
        controller.getIndividualActivities(mockParams, mockQuery, mockUser),
      ).rejects.toThrow(
        'Access to constituent activities requires an elected office',
      )

      expect(electedOfficeService.getCurrentElectedOffice).toHaveBeenCalledWith(
        1,
      )
    })

    it('checks elected office for the requesting user', async () => {
      const differentUser = { id: 42 } as User
      const mockElectedOffice = {
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
      }

      vi.spyOn(
        electedOfficeService,
        'getCurrentElectedOffice',
      ).mockResolvedValue(mockElectedOffice)

      await controller.getIndividualActivities(
        mockParams,
        mockQuery,
        differentUser,
      )

      expect(electedOfficeService.getCurrentElectedOffice).toHaveBeenCalledWith(
        42,
      )
    })
  })
})
