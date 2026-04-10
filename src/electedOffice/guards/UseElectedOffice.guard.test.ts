import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { ExecutionContext, NotFoundException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ElectedOffice } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RequireElectedOfficeMetadata } from '../decorators/UseElectedOffice.decorator'
import { ElectedOfficeService } from '../services/electedOffice.service'
import { UseElectedOfficeGuard } from './UseElectedOffice.guard'

const mockEO: ElectedOffice = {
  id: 'eo-1',
  organizationSlug: 'campaign-100',
  userId: 1,
  campaignId: 100,
  swornInDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('UseElectedOfficeGuard', () => {
  let guard: UseElectedOfficeGuard
  let electedOfficeService: ElectedOfficeService
  let reflector: Reflector
  let mockOrgFindFirst: ReturnType<typeof vi.fn>

  function buildContext({
    headers = {},
    userId = 1,
  }: {
    headers?: Record<string, string>
    userId?: number
  } = {}): ExecutionContext {
    const req = {
      headers,
      user: { id: userId },
      electedOffice: undefined,
    }
    return {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext
  }

  function mockMetadata(meta: RequireElectedOfficeMetadata = {}) {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(meta)
  }

  beforeEach(() => {
    mockOrgFindFirst = vi.fn()

    electedOfficeService = {
      findFirst: vi.fn(),
      client: {
        organization: {
          findFirst: mockOrgFindFirst,
        },
      },
    } as unknown as ElectedOfficeService

    reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(undefined),
    } as unknown as Reflector

    guard = new UseElectedOfficeGuard(
      electedOfficeService,
      reflector,
      createMockLogger(),
    )
  })

  describe('step 1: organization header', () => {
    it('resolves EO via org header', async () => {
      mockMetadata()
      mockOrgFindFirst.mockResolvedValue({ slug: 'campaign-100', ownerId: 1 })
      vi.spyOn(electedOfficeService, 'findFirst').mockResolvedValue(mockEO)

      const ctx = buildContext({
        headers: { 'x-organization-slug': 'campaign-100' },
      })
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
      expect(mockOrgFindFirst).toHaveBeenCalledWith({
        where: { slug: 'campaign-100', ownerId: 1 },
      })
      expect(electedOfficeService.findFirst).toHaveBeenCalledWith({
        where: { organizationSlug: 'campaign-100', userId: 1 },
        include: undefined,
      })
      const req = ctx.switchToHttp().getRequest() as {
        electedOffice?: ElectedOffice
      }
      expect(req.electedOffice).toEqual(mockEO)
    })

    it('passes include to EO query when specified', async () => {
      const include = { polls: true }
      mockMetadata({ include })
      mockOrgFindFirst.mockResolvedValue({ slug: 'campaign-100', ownerId: 1 })
      vi.spyOn(electedOfficeService, 'findFirst').mockResolvedValue(mockEO)

      const ctx = buildContext({
        headers: { 'x-organization-slug': 'campaign-100' },
      })
      await guard.canActivate(ctx)

      expect(electedOfficeService.findFirst).toHaveBeenCalledWith({
        where: { organizationSlug: 'campaign-100', userId: 1 },
        include: { polls: true },
      })
    })

    it('throws NotFoundException when org has no elected office', async () => {
      mockMetadata()
      mockOrgFindFirst.mockResolvedValue({ slug: 'campaign-100', ownerId: 1 })
      vi.spyOn(electedOfficeService, 'findFirst').mockResolvedValue(null)

      const ctx = buildContext({
        headers: { 'x-organization-slug': 'campaign-100' },
      })

      await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException)
      expect(electedOfficeService.findFirst).toHaveBeenCalledTimes(1)
      expect(electedOfficeService.findFirst).toHaveBeenCalledWith({
        where: { organizationSlug: 'campaign-100', userId: 1 },
        include: undefined,
      })
    })

    it('throws NotFoundException when org not found', async () => {
      mockMetadata()
      mockOrgFindFirst.mockResolvedValue(null)
      vi.spyOn(electedOfficeService, 'findFirst').mockResolvedValue(null)

      const ctx = buildContext({
        headers: { 'x-organization-slug': 'nonexistent' },
      })

      await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException)
    })

    it('throws NotFoundException when ownerId does not match', async () => {
      mockMetadata()
      mockOrgFindFirst.mockResolvedValue(null)
      vi.spyOn(electedOfficeService, 'findFirst').mockResolvedValue(null)

      const ctx = buildContext({
        headers: { 'x-organization-slug': 'campaign-100' },
        userId: 999,
      })

      await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException)
      expect(mockOrgFindFirst).toHaveBeenCalledWith({
        where: { slug: 'campaign-100', ownerId: 999 },
      })
    })
  })

  describe('no header behavior', () => {
    it('throws NotFoundException when no header and no continueIfNotFound', async () => {
      mockMetadata()

      const ctx = buildContext()

      await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException)
    })

    it('returns true when continueIfNotFound and no header', async () => {
      mockMetadata({ continueIfNotFound: true })

      const ctx = buildContext()
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
      const req = ctx.switchToHttp().getRequest() as {
        electedOffice?: ElectedOffice
      }
      expect(req.electedOffice).toBeUndefined()
    })
  })
})
