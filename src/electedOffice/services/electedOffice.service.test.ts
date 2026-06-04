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

describe('ElectedOfficeService', () => {
  let service: ElectedOfficeService
  let mockOrgCreate: ReturnType<typeof vi.fn>
  let mockEoCreate: ReturnType<typeof vi.fn>
  let mockOnElectedOfficeCreated: ReturnType<typeof vi.fn>
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

    mockOnElectedOfficeCreated = vi.fn().mockResolvedValue(undefined)
    service = new ElectedOfficeService({
      onElectedOfficeCreated: mockOnElectedOfficeCreated,
    } as never)
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
    it('returns the existing elected office without creating a new one', async () => {
      const createArgs: CreateElectedOfficeArgs = {
        userId: 1,
        campaignId: 1,
      }
      const existing = {
        id: 'existing',
        userId: 1,
        campaignId: 1,
        organizationSlug: 'eo-existing',
      }

      mockModel.findFirst.mockResolvedValue(existing)

      const result = await service.create(createArgs)

      expect(result).toBe(existing)
      expect(mockModel.findFirst).toHaveBeenCalledWith({
        where: { userId: 1 },
      })
      expect(mockOrgCreate).not.toHaveBeenCalled()
      expect(mockEoCreate).not.toHaveBeenCalled()
      // The schedule dispatch is the only recovery path for an office whose
      // earlier create committed but never dispatched, so it must still fire.
      expect(mockOnElectedOfficeCreated).toHaveBeenCalledWith(existing)
    })

    it('returns the concurrently-created office when the insert hits the unique constraint', async () => {
      const createArgs: CreateElectedOfficeArgs = {
        userId: 1,
        campaignId: 1,
      }
      const concurrent = {
        id: 'concurrent',
        userId: 1,
        campaignId: 1,
        organizationSlug: 'eo-concurrent',
      }

      mockModel.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(concurrent)
      mockEoCreate.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      )

      const result = await service.create(createArgs)

      expect(result).toBe(concurrent)
      expect(mockOnElectedOfficeCreated).toHaveBeenCalledWith(concurrent)
    })

    it('creates organization with default org data and elected office in transaction', async () => {
      const createArgs: CreateElectedOfficeArgs = {
        userId: 1,
        campaignId: 1,
      }

      mockModel.findFirst.mockResolvedValue(null)

      await service.create(createArgs)

      expect(mockOrgCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          slug: expect.stringMatching(/^eo-/),
          ownerId: 1,
          positionId: null,
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

    it('uses orgData directly when provided', async () => {
      const createArgs: CreateElectedOfficeArgs = {
        userId: 1,
        campaignId: 1,
        orgData: {
          positionId: 'org-header-position-id',
          customPositionName: 'City Council',
          overrideDistrictId: 'org-header-district-id',
        },
      }

      mockModel.findFirst.mockResolvedValue(null)

      await service.create(createArgs)

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
})
