import { OrganizationsService } from '@/organizations/services/organizations.service'
import { ConflictException } from '@nestjs/common'
import { Prisma, PrismaClient } from '@prisma/client'
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from 'vitest'
import {
  CreateElectedOfficeArgs,
  ElectedOfficeService,
} from './electedOffice.service'

const GP_POSITION_ID = 'gp-position-uuid-123'
const BR_POSITION_ID = 'br-position-456'

describe('ElectedOfficeService', () => {
  let service: ElectedOfficeService
  let mockResolveOrgData: ReturnType<typeof vi.fn>
  let mockOrgCreate: ReturnType<typeof vi.fn>
  let mockEoCreate: ReturnType<typeof vi.fn>
  let mockModel: {
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    count: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockResolveOrgData = vi.fn().mockResolvedValue({
      positionId: GP_POSITION_ID,
      customPositionName: null,
      overrideDistrictId: null,
    })
    mockOrgCreate = vi.fn().mockResolvedValue({})
    mockEoCreate = vi.fn().mockResolvedValue({
      id: 'mock-uuid',
      userId: 1,
      campaignId: 1,
      organizationSlug: 'eo-mock-uuid',
    })

    const mockTransaction = vi.fn(
      async (callback: Parameters<PrismaClient['$transaction']>[0]) => {
        const tx = {
          organization: { create: mockOrgCreate },
          electedOffice: { create: mockEoCreate },
        }
        return callback(
          tx as unknown as Parameters<
            Parameters<PrismaClient['$transaction']>[0]
          >[0],
        )
      },
    ) as MockedFunction<PrismaClient['$transaction']>

    mockModel = {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    }

    service = new ElectedOfficeService({
      resolveOrgData: mockResolveOrgData,
    } as unknown as OrganizationsService)
    Object.defineProperty(service, 'model', {
      get: () => mockModel,
      configurable: true,
    })
    Object.defineProperty(service, '_prisma', {
      get: () => ({ $transaction: mockTransaction }),
      configurable: true,
    })
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('throws ConflictException when creating active office and user already has one', async () => {
      const createArgs: CreateElectedOfficeArgs = {
        ballotreadyPositionId: BR_POSITION_ID,
        electedDate: new Date('2024-01-01'),
        isActive: true,
        userId: 1,
        campaignId: 1,
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
      expect(mockOrgCreate).not.toHaveBeenCalled()
      expect(mockEoCreate).not.toHaveBeenCalled()
    })

    it('throws ConflictException when creating office with isActive not specified and user already has one', async () => {
      const createArgs: CreateElectedOfficeArgs = {
        ballotreadyPositionId: BR_POSITION_ID,
        electedDate: new Date('2024-01-01'),
        userId: 1,
        campaignId: 1,
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
      expect(mockOrgCreate).not.toHaveBeenCalled()
      expect(mockEoCreate).not.toHaveBeenCalled()
    })

    it('creates organization with resolved org data and elected office in transaction', async () => {
      const createArgs: CreateElectedOfficeArgs = {
        ballotreadyPositionId: BR_POSITION_ID,
        electedDate: new Date('2024-01-01'),
        isActive: true,
        userId: 1,
        campaignId: 1,
      }

      mockModel.count.mockResolvedValue(0)

      await service.create(createArgs)

      expect(mockResolveOrgData).toHaveBeenCalledWith({
        ballotReadyPositionId: BR_POSITION_ID,
        office: undefined,
        otherOffice: undefined,
        state: undefined,
        L2DistrictType: undefined,
        L2DistrictName: undefined,
      })
      expect(mockOrgCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          slug: expect.stringMatching(/^eo-/),
          ownerId: 1,
          positionId: GP_POSITION_ID,
          customPositionName: null,
          overrideDistrictId: null,
        }),
      })
      expect(mockEoCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          electedDate: new Date('2024-01-01'),
          isActive: true,
          userId: 1,
          campaignId: 1,
          organizationSlug: expect.stringMatching(/^eo-/),
        }),
      })
    })

    it('creates organization with null positionId when resolveOrgData returns null', async () => {
      mockResolveOrgData.mockResolvedValue({
        positionId: null,
        customPositionName: null,
        overrideDistrictId: null,
      })

      const createArgs: CreateElectedOfficeArgs = {
        ballotreadyPositionId: BR_POSITION_ID,
        electedDate: new Date('2024-01-01'),
        isActive: true,
        userId: 1,
        campaignId: 1,
      }

      mockModel.count.mockResolvedValue(0)

      await service.create(createArgs)

      expect(mockResolveOrgData).toHaveBeenCalledWith(
        expect.objectContaining({
          ballotReadyPositionId: BR_POSITION_ID,
        }),
      )
      expect(mockOrgCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          positionId: null,
        }),
      })
    })

    it('skips active validation when isActive is false', async () => {
      const createArgs: CreateElectedOfficeArgs = {
        ballotreadyPositionId: BR_POSITION_ID,
        electedDate: new Date('2024-01-01'),
        isActive: false,
        userId: 1,
        campaignId: 1,
      }

      await service.create(createArgs)

      expect(mockModel.count).not.toHaveBeenCalled()
      expect(mockResolveOrgData).toHaveBeenCalled()
      expect(mockOrgCreate).toHaveBeenCalled()
      expect(mockEoCreate).toHaveBeenCalled()
    })

    it('passes district data to resolveOrgData', async () => {
      const createArgs: CreateElectedOfficeArgs = {
        ballotreadyPositionId: BR_POSITION_ID,
        electedDate: new Date('2024-01-01'),
        userId: 1,
        campaignId: 1,
        state: 'CA',
        L2DistrictType: 'State Senate',
        L2DistrictName: 'District 1',
      }

      mockModel.count.mockResolvedValue(0)

      await service.create(createArgs)

      expect(mockResolveOrgData).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'CA',
          L2DistrictType: 'State Senate',
          L2DistrictName: 'District 1',
        }),
      )
    })

    it('uses orgData directly when provided, skipping campaign org lookup and resolveOrgData', async () => {
      const createArgs: CreateElectedOfficeArgs = {
        electedDate: new Date('2024-01-01'),
        isActive: true,
        userId: 1,
        campaignId: 1,
        orgData: {
          positionId: 'org-header-position-id',
          customPositionName: 'City Council',
          overrideDistrictId: 'org-header-district-id',
        },
      }

      mockModel.count.mockResolvedValue(0)

      await service.create(createArgs)

      expect(mockResolveOrgData).not.toHaveBeenCalled()
      expect(mockOrgCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          slug: expect.stringMatching(/^eo-/),
          ownerId: 1,
          positionId: 'org-header-position-id',
          customPositionName: 'City Council',
          overrideDistrictId: 'org-header-district-id',
        }),
      })
    })

    it('links elected office to organization via matching slug', async () => {
      const createArgs: CreateElectedOfficeArgs = {
        ballotreadyPositionId: BR_POSITION_ID,
        electedDate: new Date('2024-01-01'),
        userId: 1,
        campaignId: 1,
      }

      mockModel.count.mockResolvedValue(0)

      await service.create(createArgs)

      const orgSlug = mockOrgCreate.mock.calls[0][0].data.slug as string
      const eoOrgSlug = mockEoCreate.mock.calls[0][0].data
        .organizationSlug as string
      expect(orgSlug).toBe(eoOrgSlug)
    })
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
