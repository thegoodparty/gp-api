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
  isActive: true,
  electedDate: null,
  swornInDate: null,
  termStartDate: null,
  termEndDate: null,
  termLengthDays: null,
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
    params = {},
    userId = 1,
  }: {
    headers?: Record<string, string>
    params?: Record<string, string>
    userId?: number
  } = {}): ExecutionContext {
    const req = {
      headers,
      params,
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

  describe('step 1: route param', () => {
    it('resolves EO by route param id and userId', async () => {
      mockMetadata()
      vi.spyOn(electedOfficeService, 'findFirst').mockResolvedValue(mockEO)

      const ctx = buildContext({ params: { id: 'eo-1' } })
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
      expect(electedOfficeService.findFirst).toHaveBeenCalledWith({
        where: { id: 'eo-1', userId: 1 },
        include: undefined,
      })
      const req = ctx.switchToHttp().getRequest() as {
        electedOffice?: ElectedOffice
      }
      expect(req.electedOffice).toEqual(mockEO)
    })

    it('uses custom param name', async () => {
      mockMetadata({ param: 'electedOfficeId' })
      vi.spyOn(electedOfficeService, 'findFirst').mockResolvedValue(mockEO)

      const ctx = buildContext({ params: { electedOfficeId: 'eo-1' } })
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
      expect(electedOfficeService.findFirst).toHaveBeenCalledWith({
        where: { id: 'eo-1', userId: 1 },
        include: undefined,
      })
    })

    it('throws NotFoundException when route param EO not found', async () => {
      mockMetadata()
      vi.spyOn(electedOfficeService, 'findFirst').mockResolvedValue(null)

      const ctx = buildContext({ params: { id: 'nonexistent' } })

      await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException)
    })

    it('skips header and fallback when route param is present', async () => {
      mockMetadata()
      vi.spyOn(electedOfficeService, 'findFirst').mockResolvedValue(mockEO)

      const ctx = buildContext({
        params: { id: 'eo-1' },
        headers: { 'x-organization-slug': 'campaign-100' },
      })
      await guard.canActivate(ctx)

      expect(mockOrgFindFirst).not.toHaveBeenCalled()
      expect(electedOfficeService.findFirst).toHaveBeenCalledTimes(1)
    })
  })

  describe('step 2: organization header', () => {
    it('resolves EO via org header when no route param', async () => {
      mockMetadata()
      mockOrgFindFirst.mockResolvedValue({ electedOffice: mockEO })

      const ctx = buildContext({
        headers: { 'x-organization-slug': 'campaign-100' },
      })
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
      expect(mockOrgFindFirst).toHaveBeenCalledWith({
        where: { slug: 'campaign-100', ownerId: 1 },
        include: { electedOffice: true },
      })
      const req = ctx.switchToHttp().getRequest() as {
        electedOffice?: ElectedOffice
      }
      expect(req.electedOffice).toEqual(mockEO)
    })

    it('passes include to org query when specified', async () => {
      const include = { polls: true }
      mockMetadata({ include })
      mockOrgFindFirst.mockResolvedValue({ electedOffice: mockEO })

      const ctx = buildContext({
        headers: { 'x-organization-slug': 'campaign-100' },
      })
      await guard.canActivate(ctx)

      expect(mockOrgFindFirst).toHaveBeenCalledWith({
        where: { slug: 'campaign-100', ownerId: 1 },
        include: { electedOffice: { include: { polls: true } } },
      })
    })

    it('falls back to legacy when org has no elected office', async () => {
      mockMetadata()
      mockOrgFindFirst.mockResolvedValue({ electedOffice: null })
      vi.spyOn(electedOfficeService, 'findFirst').mockResolvedValue(mockEO)

      const ctx = buildContext({
        headers: { 'x-organization-slug': 'campaign-100' },
      })
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
      expect(electedOfficeService.findFirst).toHaveBeenCalledWith({
        where: { userId: 1, isActive: true },
        include: undefined,
      })
    })

    it('falls back to legacy when org not found', async () => {
      mockMetadata()
      mockOrgFindFirst.mockResolvedValue(null)
      vi.spyOn(electedOfficeService, 'findFirst').mockResolvedValue(mockEO)

      const ctx = buildContext({
        headers: { 'x-organization-slug': 'nonexistent' },
      })
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
      expect(electedOfficeService.findFirst).toHaveBeenCalledWith({
        where: { userId: 1, isActive: true },
        include: undefined,
      })
    })

    it('skips org lookup and falls back when ownerId does not match', async () => {
      mockMetadata()
      mockOrgFindFirst.mockResolvedValue(null)
      vi.spyOn(electedOfficeService, 'findFirst').mockResolvedValue(mockEO)

      const ctx = buildContext({
        headers: { 'x-organization-slug': 'campaign-100' },
        userId: 999,
      })
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
      expect(mockOrgFindFirst).toHaveBeenCalledWith({
        where: { slug: 'campaign-100', ownerId: 999 },
        include: { electedOffice: true },
      })
      expect(electedOfficeService.findFirst).toHaveBeenCalledWith({
        where: { userId: 999, isActive: true },
        include: undefined,
      })
    })
  })

  describe('step 3: legacy fallback (userId + isActive)', () => {
    it('resolves EO by userId when no header and no route param', async () => {
      mockMetadata()
      vi.spyOn(electedOfficeService, 'findFirst').mockResolvedValue(mockEO)

      const ctx = buildContext()
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
      expect(mockOrgFindFirst).not.toHaveBeenCalled()
      expect(electedOfficeService.findFirst).toHaveBeenCalledWith({
        where: { userId: 1, isActive: true },
        include: undefined,
      })
      const req = ctx.switchToHttp().getRequest() as {
        electedOffice?: ElectedOffice
      }
      expect(req.electedOffice).toEqual(mockEO)
    })

    it('throws NotFoundException when no EO found at all', async () => {
      mockMetadata()
      vi.spyOn(electedOfficeService, 'findFirst').mockResolvedValue(null)

      const ctx = buildContext()

      await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException)
    })

    it('returns true when continueIfNotFound and no EO found', async () => {
      mockMetadata({ continueIfNotFound: true })
      vi.spyOn(electedOfficeService, 'findFirst').mockResolvedValue(null)

      const ctx = buildContext()
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
      const req = ctx.switchToHttp().getRequest() as {
        electedOffice?: ElectedOffice
      }
      expect(req.electedOffice).toBeUndefined()
    })
  })

  describe('param option prevents misuse of route :id', () => {
    it('does not use route :id when param is set to a different name', async () => {
      mockMetadata({ param: 'electedOfficeId' })
      vi.spyOn(electedOfficeService, 'findFirst').mockResolvedValue(mockEO)

      const ctx = buildContext({ params: { id: 'person-123' } })
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
      // Should NOT have looked up 'person-123' as an EO id
      expect(electedOfficeService.findFirst).toHaveBeenCalledWith({
        where: { userId: 1, isActive: true },
        include: undefined,
      })
    })
  })
})
