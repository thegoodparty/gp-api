import { ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElectedOfficeService } from './electedOffice.service'

describe('ElectedOfficeService', () => {
  let service: ElectedOfficeService
  let mockModel: {
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    count: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockModel = {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    }

    service = new ElectedOfficeService()
    Object.defineProperty(service, 'model', {
      get: () => mockModel,
      configurable: true,
    })
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('throws ConflictException when creating active office and user already has one', async () => {
      const createArgs: Prisma.ElectedOfficeCreateArgs = {
        data: {
          electedDate: new Date('2024-01-01'),
          isActive: true,
          user: { connect: { id: 1 } },
          campaign: { connect: { id: 1 } },
        },
      }

      mockModel.count.mockResolvedValue(1)

      await expect(service.create(createArgs)).rejects.toThrow(
        ConflictException,
      )
      await expect(service.create(createArgs)).rejects.toThrow(
        'User already has an active elected office',
      )

      expect(mockModel.count).toHaveBeenCalledWith({
        where: {
          userId: 1,
          isActive: true,
        },
      })
      expect(mockModel.create).not.toHaveBeenCalled()
    })

    it('throws ConflictException when creating office with isActive not specified and user already has one', async () => {
      const createArgs: Prisma.ElectedOfficeCreateArgs = {
        data: {
          electedDate: new Date('2024-01-01'),
          user: { connect: { id: 1 } },
          campaign: { connect: { id: 1 } },
        },
      }

      mockModel.count.mockResolvedValue(1)

      await expect(service.create(createArgs)).rejects.toThrow(
        ConflictException,
      )
      await expect(service.create(createArgs)).rejects.toThrow(
        'User already has an active elected office',
      )

      expect(mockModel.count).toHaveBeenCalledWith({
        where: {
          userId: 1,
          isActive: true,
        },
      })
      expect(mockModel.create).not.toHaveBeenCalled()
    })
  })

  it('creates active elected office when user has no active office', async () => {
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

    const createArgs: Prisma.ElectedOfficeCreateArgs = {
      data: {
        electedDate: new Date('2024-01-01'),
        isActive: true,
        user: { connect: { id: 1 } },
        campaign: { connect: { id: 1 } },
      },
    }

    mockModel.count.mockResolvedValue(0)
    mockModel.create.mockResolvedValue(mockElectedOffice)

    const result = await service.create(createArgs)

    expect(mockModel.count).toHaveBeenCalledWith({
      where: {
        userId: 1,
        isActive: true,
      },
    })
    expect(mockModel.create).toHaveBeenCalledWith(createArgs)
    expect(result).toEqual(mockElectedOffice)
  })

  it('creates inactive elected office when isActive is false', async () => {
    const mockElectedOffice = {
      id: 'office-1',
      userId: 1,
      campaignId: 1,
      isActive: false,
      electedDate: new Date('2024-01-01'),
      swornInDate: null,
      termStartDate: null,
      termEndDate: null,
      termLengthDays: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const createArgs: Prisma.ElectedOfficeCreateArgs = {
      data: {
        electedDate: new Date('2024-01-01'),
        isActive: false,
        user: { connect: { id: 1 } },
        campaign: { connect: { id: 1 } },
      },
    }

    mockModel.create.mockResolvedValue(mockElectedOffice)

    const result = await service.create(createArgs)

    expect(mockModel.count).not.toHaveBeenCalled()
    expect(mockModel.create).toHaveBeenCalledWith(createArgs)
    expect(result).toEqual(mockElectedOffice)
  })

  describe('update', () => {
    it('throws ConflictException when updating to active and user already has another active office', async () => {
      const updateArgs: Prisma.ElectedOfficeUpdateArgs = {
        where: { id: 'office-1' },
        data: {
          isActive: true,
        },
      }

      mockModel.findUnique.mockResolvedValue({ userId: 1 })
      mockModel.count.mockResolvedValue(1)

      await expect(service.update(updateArgs)).rejects.toThrow(
        ConflictException,
      )
      await expect(service.update(updateArgs)).rejects.toThrow(
        'User already has an active elected office',
      )

      expect(mockModel.findUnique).toHaveBeenCalledWith({
        where: { id: 'office-1' },
        select: { userId: true },
      })
      expect(mockModel.count).toHaveBeenCalledWith({
        where: {
          userId: 1,
          isActive: true,
          id: { not: 'office-1' },
        },
      })
      expect(mockModel.update).not.toHaveBeenCalled()
    })
    it('updates elected office when isActive is not changed to true', async () => {
      const mockElectedOffice = {
        id: 'office-1',
        userId: 1,
        campaignId: 1,
        isActive: false,
        electedDate: new Date('2024-01-01'),
        swornInDate: null,
        termStartDate: null,
        termEndDate: null,
        termLengthDays: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const updateArgs: Prisma.ElectedOfficeUpdateArgs = {
        where: { id: 'office-1' },
        data: {
          electedDate: new Date('2024-02-01'),
        },
      }

      mockModel.update.mockResolvedValue(mockElectedOffice)

      const result = await service.update(updateArgs)

      expect(mockModel.findUnique).not.toHaveBeenCalled()
      expect(mockModel.count).not.toHaveBeenCalled()
      expect(mockModel.update).toHaveBeenCalledWith(updateArgs)
      expect(result).toEqual(mockElectedOffice)
    })

    it('updates elected office to inactive without validation', async () => {
      const mockElectedOffice = {
        id: 'office-1',
        userId: 1,
        campaignId: 1,
        isActive: false,
        electedDate: new Date('2024-01-01'),
        swornInDate: null,
        termStartDate: null,
        termEndDate: null,
        termLengthDays: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const updateArgs: Prisma.ElectedOfficeUpdateArgs = {
        where: { id: 'office-1' },
        data: {
          isActive: false,
        },
      }

      mockModel.update.mockResolvedValue(mockElectedOffice)

      const result = await service.update(updateArgs)

      expect(mockModel.findUnique).not.toHaveBeenCalled()
      expect(mockModel.count).not.toHaveBeenCalled()
      expect(mockModel.update).toHaveBeenCalledWith(updateArgs)
      expect(result).toEqual(mockElectedOffice)
    })

    it('updates elected office to active when user has no other active office', async () => {
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

      const updateArgs: Prisma.ElectedOfficeUpdateArgs = {
        where: { id: 'office-1' },
        data: {
          isActive: true,
        },
      }

      mockModel.findUnique.mockResolvedValue({ userId: 1 })
      mockModel.count.mockResolvedValue(0)
      mockModel.update.mockResolvedValue(mockElectedOffice)

      const result = await service.update(updateArgs)

      expect(mockModel.findUnique).toHaveBeenCalledWith({
        where: { id: 'office-1' },
        select: { userId: true },
      })
      expect(mockModel.count).toHaveBeenCalledWith({
        where: {
          userId: 1,
          isActive: true,
          id: { not: 'office-1' },
        },
      })
      expect(mockModel.update).toHaveBeenCalledWith(updateArgs)
      expect(result).toEqual(mockElectedOffice)
    })

    it('skips validation when existing office is not found', async () => {
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

      const updateArgs: Prisma.ElectedOfficeUpdateArgs = {
        where: { id: 'office-1' },
        data: {
          isActive: true,
        },
      }

      mockModel.findUnique.mockResolvedValue(null)
      mockModel.update.mockResolvedValue(mockElectedOffice)

      const result = await service.update(updateArgs)

      expect(mockModel.findUnique).toHaveBeenCalled()
      expect(mockModel.count).not.toHaveBeenCalled()
      expect(mockModel.update).toHaveBeenCalledWith(updateArgs)
      expect(result).toEqual(mockElectedOffice)
    })
  })

  describe('getCurrentElectedOffice', () => {
    it('returns active elected office for user and filters out inactive elected offices', async () => {
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

      mockModel.findFirst.mockResolvedValue(mockElectedOffice)

      const result = await service.getCurrentElectedOffice(1)

      expect(mockModel.findFirst).toHaveBeenCalledWith({
        where: { userId: 1, isActive: true },
      })
      expect(result).toEqual(mockElectedOffice)
    })
  })
})
