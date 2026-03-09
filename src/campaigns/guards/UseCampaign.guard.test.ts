import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { ExecutionContext, NotFoundException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Campaign } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RequireCamapaignMetadata } from '../decorators/UseCampaign.decorator'
import { CampaignsService } from '../services/campaigns.service'
import { UseCampaignGuard } from './UseCampaign.guard'

const mockCampaign = {
  id: 100,
  slug: 'my-campaign',
  userId: 1,
  pathToVictory: { data: {} },
} as unknown as Campaign

describe('UseCampaignGuard', () => {
  let guard: UseCampaignGuard
  let campaignsService: CampaignsService
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
      params: {},
      user: { id: userId },
      campaign: undefined,
    }
    return {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext
  }

  function mockMetadata(meta: RequireCamapaignMetadata = {}) {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(meta)
  }

  beforeEach(() => {
    mockOrgFindFirst = vi.fn()

    campaignsService = {
      findByUserId: vi.fn(),
      client: {
        organization: {
          findFirst: mockOrgFindFirst,
        },
      },
    } as unknown as CampaignsService

    reflector = {
      getAllAndOverride: vi.fn().mockReturnValue({}),
    } as unknown as Reflector

    guard = new UseCampaignGuard(
      campaignsService,
      reflector,
      createMockLogger(),
    )
  })

  describe('step 1: organization header', () => {
    it('resolves campaign via org header', async () => {
      mockMetadata()
      mockOrgFindFirst.mockResolvedValue({ campaign: mockCampaign })

      const ctx = buildContext({
        headers: { 'x-organization-slug': 'campaign-100' },
      })
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
      expect(mockOrgFindFirst).toHaveBeenCalledWith({
        where: { slug: 'campaign-100', ownerId: 1 },
        include: { campaign: { include: { pathToVictory: true } } },
      })
      const req = ctx.switchToHttp().getRequest() as {
        campaign?: Campaign
      }
      expect(req.campaign).toEqual(mockCampaign)
    })

    it('uses custom include when specified', async () => {
      const include = { pathToVictory: true, user: true }
      mockMetadata({ include })
      mockOrgFindFirst.mockResolvedValue({ campaign: mockCampaign })

      const ctx = buildContext({
        headers: { 'x-organization-slug': 'campaign-100' },
      })
      await guard.canActivate(ctx)

      expect(mockOrgFindFirst).toHaveBeenCalledWith({
        where: { slug: 'campaign-100', ownerId: 1 },
        include: {
          campaign: { include: { pathToVictory: true, user: true } },
        },
      })
    })

    it('falls back to userId when org has no campaign', async () => {
      mockMetadata()
      mockOrgFindFirst.mockResolvedValue({ campaign: null })
      vi.spyOn(campaignsService, 'findByUserId').mockResolvedValue(mockCampaign)

      const ctx = buildContext({
        headers: { 'x-organization-slug': 'campaign-100' },
      })
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
      expect(campaignsService.findByUserId).toHaveBeenCalledWith(1, {
        pathToVictory: true,
      })
    })

    it('falls back to userId when org not found', async () => {
      mockMetadata()
      mockOrgFindFirst.mockResolvedValue(null)
      vi.spyOn(campaignsService, 'findByUserId').mockResolvedValue(mockCampaign)

      const ctx = buildContext({
        headers: { 'x-organization-slug': 'nonexistent' },
      })
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
      expect(campaignsService.findByUserId).toHaveBeenCalledWith(1, {
        pathToVictory: true,
      })
    })

    it('falls back when ownerId does not match', async () => {
      mockMetadata()
      mockOrgFindFirst.mockResolvedValue(null)
      vi.spyOn(campaignsService, 'findByUserId').mockResolvedValue(mockCampaign)

      const ctx = buildContext({
        headers: { 'x-organization-slug': 'campaign-100' },
        userId: 999,
      })
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
      expect(mockOrgFindFirst).toHaveBeenCalledWith({
        where: { slug: 'campaign-100', ownerId: 999 },
        include: { campaign: { include: { pathToVictory: true } } },
      })
      expect(campaignsService.findByUserId).toHaveBeenCalledWith(999, {
        pathToVictory: true,
      })
    })

    it('does not call findByUserId when org header resolves campaign', async () => {
      mockMetadata()
      mockOrgFindFirst.mockResolvedValue({ campaign: mockCampaign })

      const ctx = buildContext({
        headers: { 'x-organization-slug': 'campaign-100' },
      })
      await guard.canActivate(ctx)

      expect(campaignsService.findByUserId).not.toHaveBeenCalled()
    })
  })

  describe('step 2: legacy fallback (findByUserId)', () => {
    it('resolves campaign by userId when no header', async () => {
      mockMetadata()
      vi.spyOn(campaignsService, 'findByUserId').mockResolvedValue(mockCampaign)

      const ctx = buildContext()
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
      expect(mockOrgFindFirst).not.toHaveBeenCalled()
      expect(campaignsService.findByUserId).toHaveBeenCalledWith(1, {
        pathToVictory: true,
      })
      const req = ctx.switchToHttp().getRequest() as {
        campaign?: Campaign
      }
      expect(req.campaign).toEqual(mockCampaign)
    })

    it('throws NotFoundException when no campaign found', async () => {
      mockMetadata()
      vi.spyOn(campaignsService, 'findByUserId').mockResolvedValue(null)

      const ctx = buildContext()

      await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException)
    })

    it('returns true when continueIfNotFound and no campaign found', async () => {
      mockMetadata({ continueIfNotFound: true })
      vi.spyOn(campaignsService, 'findByUserId').mockResolvedValue(null)

      const ctx = buildContext()
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
      const req = ctx.switchToHttp().getRequest() as {
        campaign?: Campaign
      }
      expect(req.campaign).toBeUndefined()
    })
  })
})
