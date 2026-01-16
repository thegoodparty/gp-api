import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { User } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElectedOfficeController } from './electedOffice.controller'
import { CreateElectedOfficeDto } from './schemas/electedOffice.schema'
import { ElectedOfficeService } from './services/electedOffice.service'

describe('ElectedOfficeController', () => {
  let controller: ElectedOfficeController
  let electedOfficeService: ElectedOfficeService
  let mockClient: {
    campaign: {
      findFirst: ReturnType<typeof vi.fn>
    }
  }

  beforeEach(() => {
    electedOfficeService = {
      getCurrentElectedOffice: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      client: {
        campaign: {
          findFirst: vi.fn(),
        },
      },
    } as unknown as ElectedOfficeService

    mockClient = electedOfficeService.client as unknown as {
      campaign: {
        findFirst: ReturnType<typeof vi.fn>
      }
    }

    controller = new ElectedOfficeController(electedOfficeService)
    vi.clearAllMocks()
  })

  describe('getCurrent', () => {
    it('returns current active elected office', async () => {
      const mockElectedOffice = {
        id: 'office-1',
        userId: 1,
        campaignId: 1,
        isActive: true,
        electedDate: new Date('2024-01-01'),
        swornInDate: new Date('2024-01-15'),
        termStartDate: new Date('2024-01-15'),
        termEndDate: new Date('2026-01-15'),
        termLengthDays: 730,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const user = { id: 1 } as User

      vi.spyOn(
        electedOfficeService,
        'getCurrentElectedOffice',
      ).mockResolvedValue(mockElectedOffice)

      const result = await controller.getCurrent(user)

      expect(electedOfficeService.getCurrentElectedOffice).toHaveBeenCalledWith(
        1,
      )
      expect(result).toEqual({
        id: 'office-1',
        electedDate: '2024-01-01',
        swornInDate: '2024-01-15',
        termStartDate: '2024-01-15',
        termEndDate: '2026-01-15',
      })
    })

    it('throws NotFoundException when no active elected office exists', async () => {
      const user = { id: 1 } as User

      vi.spyOn(
        electedOfficeService,
        'getCurrentElectedOffice',
      ).mockResolvedValue(null)

      await expect(controller.getCurrent(user)).rejects.toThrow(
        NotFoundException,
      )
      await expect(controller.getCurrent(user)).rejects.toThrow(
        'No active elected office found',
      )

      expect(electedOfficeService.getCurrentElectedOffice).toHaveBeenCalledWith(
        1,
      )
    })
  })

  describe('getOne', () => {
    it('returns elected office when user owns it', async () => {
      const mockElectedOffice = {
        id: 'office-1',
        userId: 1,
        campaignId: 1,
        isActive: true,
        electedDate: new Date('2024-01-01'),
        swornInDate: new Date('2024-01-15'),
        termStartDate: new Date('2024-01-15'),
        termEndDate: new Date('2026-01-15'),
        termLengthDays: 730,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const user = { id: 1 } as User

      vi.spyOn(electedOfficeService, 'findUnique').mockResolvedValue(
        mockElectedOffice,
      )

      const result = await controller.getOne('office-1', user)

      expect(electedOfficeService.findUnique).toHaveBeenCalledWith({
        where: { id: 'office-1' },
      })
      expect(result).toEqual({
        id: 'office-1',
        electedDate: '2024-01-01',
        swornInDate: '2024-01-15',
        termStartDate: '2024-01-15',
        termEndDate: '2026-01-15',
      })
    })

    it('throws NotFoundException when user does not own the elected office', async () => {
      const mockElectedOffice = {
        id: 'office-1',
        userId: 2,
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

      const user = { id: 1 } as User

      vi.spyOn(electedOfficeService, 'findUnique').mockResolvedValue(
        mockElectedOffice,
      )

      await expect(controller.getOne('office-1', user)).rejects.toThrow(
        NotFoundException,
      )
      await expect(controller.getOne('office-1', user)).rejects.toThrow(
        'Elected office not found',
      )
    })

    it('throws NotFoundException when elected office does not exist', async () => {
      const user = { id: 1 } as User

      vi.spyOn(electedOfficeService, 'findUnique').mockResolvedValue(null)

      await expect(controller.getOne('office-1', user)).rejects.toThrow(
        NotFoundException,
      )
      await expect(controller.getOne('office-1', user)).rejects.toThrow(
        'Elected office not found',
      )

      expect(electedOfficeService.findUnique).toHaveBeenCalledWith({
        where: { id: 'office-1' },
      })
    })
  })

  describe('create', () => {
    it('creates elected office when user has a campaign', async () => {
      const mockCampaign = { id: 1 }
      const mockElectedOffice = {
        id: 'office-1',
        userId: 1,
        campaignId: 1,
        isActive: true,
        electedDate: new Date('2024-01-01'),
        swornInDate: new Date('2024-01-15'),
        termStartDate: new Date('2024-01-15'),
        termEndDate: new Date('2026-01-15'),
        termLengthDays: 730,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const user = { id: 1 } as User
      const createDto = {
        electedDate: new Date('2024-01-01'),
        swornInDate: new Date('2024-01-15'),
        termStartDate: new Date('2024-01-15'),
        termEndDate: new Date('2026-01-15'),
        termLengthDays: 730,
        isActive: true,
      }

      mockClient.campaign.findFirst.mockResolvedValue(mockCampaign)
      vi.spyOn(electedOfficeService, 'create').mockResolvedValue(
        mockElectedOffice,
      )

      const result = await controller.create(user, createDto)

      expect(mockClient.campaign.findFirst).toHaveBeenCalledWith({
        where: { userId: 1 },
        select: { id: true },
      })
      expect(electedOfficeService.create).toHaveBeenCalledWith({
        data: {
          electedDate: new Date('2024-01-01'),
          swornInDate: new Date('2024-01-15'),
          termStartDate: new Date('2024-01-15'),
          termEndDate: new Date('2026-01-15'),
          termLengthDays: 730,
          isActive: true,
          user: { connect: { id: 1 } },
          campaign: { connect: { id: 1 } },
        },
      })
      expect(result).toEqual({
        id: 'office-1',
        electedDate: '2024-01-01',
        swornInDate: '2024-01-15',
        termStartDate: '2024-01-15',
        termEndDate: '2026-01-15',
      })
    })

    it('creates elected office with optional fields', async () => {
      const mockCampaign = { id: 1 }
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

      const user = { id: 1 } as User
      const createDto = {
        electedDate: new Date('2024-01-01'),
      } as CreateElectedOfficeDto

      mockClient.campaign.findFirst.mockResolvedValue(mockCampaign)
      vi.spyOn(electedOfficeService, 'create').mockResolvedValue(
        mockElectedOffice,
      )

      const result = await controller.create(user, createDto)

      expect(electedOfficeService.create).toHaveBeenCalledWith({
        data: {
          electedDate: new Date('2024-01-01'),
          swornInDate: undefined,
          termStartDate: undefined,
          termEndDate: undefined,
          termLengthDays: undefined,
          isActive: undefined,
          user: { connect: { id: 1 } },
          campaign: { connect: { id: 1 } },
        },
      })
      expect(result).toEqual({
        id: 'office-1',
        electedDate: '2024-01-01',
        swornInDate: undefined,
        termStartDate: undefined,
        termEndDate: undefined,
      })
    })

    it('throws ForbiddenException when user has no campaign', async () => {
      const user = { id: 1 } as User
      const createDto = {
        electedDate: new Date('2024-01-01'),
      } as CreateElectedOfficeDto

      mockClient.campaign.findFirst.mockResolvedValue(null)

      await expect(controller.create(user, createDto)).rejects.toThrow(
        ForbiddenException,
      )
      await expect(controller.create(user, createDto)).rejects.toThrow(
        'Not allowed to link campaign',
      )

      expect(mockClient.campaign.findFirst).toHaveBeenCalledWith({
        where: { userId: 1 },
        select: { id: true },
      })
      expect(electedOfficeService.create).not.toHaveBeenCalled()
    })
  })

  describe('update', () => {
    it('updates elected office when user owns it', async () => {
      const existingElectedOffice = {
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

      const updatedElectedOffice = {
        ...existingElectedOffice,
        swornInDate: new Date('2024-01-15'),
        termStartDate: new Date('2024-01-15'),
        termEndDate: new Date('2026-01-15'),
        termLengthDays: 730,
      }

      const user = { id: 1 } as User
      const updateDto = {
        swornInDate: new Date('2024-01-15'),
        termStartDate: new Date('2024-01-15'),
        termEndDate: new Date('2026-01-15'),
        termLengthDays: 730,
      }

      vi.spyOn(electedOfficeService, 'findUnique').mockResolvedValue(
        existingElectedOffice,
      )
      vi.spyOn(electedOfficeService, 'update').mockResolvedValue(
        updatedElectedOffice,
      )

      const result = await controller.update('office-1', user, updateDto)

      expect(electedOfficeService.findUnique).toHaveBeenCalledWith({
        where: { id: 'office-1' },
      })
      expect(electedOfficeService.update).toHaveBeenCalledWith({
        where: { id: 'office-1' },
        data: {
          swornInDate: new Date('2024-01-15'),
          termStartDate: new Date('2024-01-15'),
          termEndDate: new Date('2026-01-15'),
          termLengthDays: 730,
        },
      })
      expect(result).toEqual({
        id: 'office-1',
        electedDate: '2024-01-01',
        swornInDate: '2024-01-15',
        termStartDate: '2024-01-15',
        termEndDate: '2026-01-15',
      })
    })

    it('throws ForbiddenException when user does not own the elected office', async () => {
      const existingElectedOffice = {
        id: 'office-1',
        userId: 2,
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

      const user = { id: 1 } as User
      const updateDto = {
        swornInDate: new Date('2024-01-15'),
      }

      vi.spyOn(electedOfficeService, 'findUnique').mockResolvedValue(
        existingElectedOffice,
      )

      await expect(
        controller.update('office-1', user, updateDto),
      ).rejects.toThrow(ForbiddenException)
      await expect(
        controller.update('office-1', user, updateDto),
      ).rejects.toThrow(
        'You do not have permission to update this elected office',
      )

      expect(electedOfficeService.findUnique).toHaveBeenCalledWith({
        where: { id: 'office-1' },
      })
      expect(electedOfficeService.update).not.toHaveBeenCalled()
    })

    it('updates elected office with null values', async () => {
      const existingElectedOffice = {
        id: 'office-1',
        userId: 1,
        campaignId: 1,
        isActive: true,
        electedDate: new Date('2024-01-01'),
        swornInDate: new Date('2024-01-15'),
        termStartDate: new Date('2024-01-15'),
        termEndDate: new Date('2026-01-15'),
        termLengthDays: 730,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const updatedElectedOffice = {
        ...existingElectedOffice,
        swornInDate: null,
        termStartDate: null,
        termEndDate: null,
        termLengthDays: null,
      }

      const user = { id: 1 } as User
      const updateDto = {
        swornInDate: null as Date | null,
        termStartDate: null as Date | null,
        termEndDate: null as Date | null,
        termLengthDays: null as number | null,
      }

      vi.spyOn(electedOfficeService, 'findUnique').mockResolvedValue(
        existingElectedOffice,
      )
      vi.spyOn(electedOfficeService, 'update').mockResolvedValue(
        updatedElectedOffice,
      )

      const result = await controller.update('office-1', user, updateDto)

      expect(electedOfficeService.update).toHaveBeenCalledWith({
        where: { id: 'office-1' },
        data: {
          swornInDate: null,
          termStartDate: null,
          termEndDate: null,
          termLengthDays: null,
        },
      })
      expect(result).toEqual({
        id: 'office-1',
        electedDate: '2024-01-01',
        swornInDate: undefined,
        termStartDate: undefined,
        termEndDate: undefined,
      })
    })
  })
})
