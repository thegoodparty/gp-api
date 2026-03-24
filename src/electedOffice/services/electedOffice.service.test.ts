import { OrganizationsService } from '@/organizations/services/organizations.service'
import { ConflictException } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
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
    findMany: ReturnType<typeof vi.fn>
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
      findMany: vi.fn(),
    }

    service = new ElectedOfficeService({
      resolveOrgData: mockResolveOrgData,
      findUnique: vi.fn().mockResolvedValue(null),
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
    it('throws ConflictException when user already has an elected office', async () => {
      const createArgs: CreateElectedOfficeArgs = {
        ballotreadyPositionId: BR_POSITION_ID,
        userId: 1,
        campaignId: 1,
      }

      mockModel.findFirst.mockResolvedValue({ id: 'existing', userId: 1 })

      await expect(service.create(createArgs)).rejects.toThrow(
        ConflictException,
      )
      await expect(service.create(createArgs)).rejects.toThrow(
        'User already has an active elected office',
      )

      expect(mockModel.findFirst).toHaveBeenCalledWith({
        where: { userId: 1 },
      })
      expect(mockOrgCreate).not.toHaveBeenCalled()
      expect(mockEoCreate).not.toHaveBeenCalled()
    })

    it('creates organization with resolved org data and elected office in transaction', async () => {
      const createArgs: CreateElectedOfficeArgs = {
        ballotreadyPositionId: BR_POSITION_ID,
        userId: 1,
        campaignId: 1,
      }

      mockModel.findFirst.mockResolvedValue(null)

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
        userId: 1,
        campaignId: 1,
      }

      mockModel.findFirst.mockResolvedValue(null)

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

    it('passes district data to resolveOrgData', async () => {
      const createArgs: CreateElectedOfficeArgs = {
        ballotreadyPositionId: BR_POSITION_ID,
        userId: 1,
        campaignId: 1,
        state: 'CA',
        L2DistrictType: 'State Senate',
        L2DistrictName: 'District 1',
      }

      mockModel.findFirst.mockResolvedValue(null)

      await service.create(createArgs)

      expect(mockResolveOrgData).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'CA',
          L2DistrictType: 'State Senate',
          L2DistrictName: 'District 1',
        }),
      )
    })

    it('links elected office to organization via matching slug', async () => {
      const createArgs: CreateElectedOfficeArgs = {
        ballotreadyPositionId: BR_POSITION_ID,
        userId: 1,
        campaignId: 1,
      }

      mockModel.findFirst.mockResolvedValue(null)

      await service.create(createArgs)

      const orgSlug = mockOrgCreate.mock.calls[0][0].data.slug as string
      const eoOrgSlug = mockEoCreate.mock.calls[0][0].data
        .organizationSlug as string
      expect(orgSlug).toBe(eoOrgSlug)
    })
  })

  describe('update', () => {
    it('delegates to model.update', async () => {
      const mockElectedOffice = {
        id: 'office-1',
        userId: 1,
        campaignId: 1,
        swornInDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const updateArgs = {
        where: { id: 'office-1' },
        data: { swornInDate: new Date('2024-01-15') },
      }

      mockModel.update.mockResolvedValue(mockElectedOffice)

      const result = await service.update(updateArgs)

      expect(mockModel.update).toHaveBeenCalledWith(updateArgs)
      expect(result).toEqual(mockElectedOffice)
    })
  })

  describe('getCurrentElectedOffice', () => {
    it('returns elected office for user', async () => {
      const mockElectedOffice = {
        id: 'office-1',
        userId: 1,
        campaignId: 1,
        swornInDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockModel.findFirst.mockResolvedValue(mockElectedOffice)

      const result = await service.getCurrentElectedOffice(1)

      expect(mockModel.findFirst).toHaveBeenCalledWith({
        where: { userId: 1 },
      })
      expect(result).toEqual(mockElectedOffice)
    })
  })
})
