import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { ExecutionContext, NotFoundException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Campaign } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RequireCampaignMetadata } from '../decorators/UseCampaign.decorator'
import { CampaignsService } from '../services/campaigns.service'
import { UseCampaignGuard } from './UseCampaign.guard'

const mockCampaign = {
  id: 100,
  slug: 'my-campaign',
  userId: 1,
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

  function mockMetadata(meta: RequireCampaignMetadata = {}) {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(meta)
  }

  beforeEach(() => {
    mockOrgFindFirst = vi.fn()

    campaignsService = {
      findFirst: vi.fn(),
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
      mockOrgFindFirst.mockResolvedValue({ slug: 'campaign-100', ownerId: 1 })
      vi.spyOn(campaignsService, 'findFirst').mockResolvedValue(mockCampaign)

      const ctx = buildContext({
        headers: { 'x-organization-slug': 'campaign-100' },
      })
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
      expect(mockOrgFindFirst).toHaveBeenCalledWith({
        where: { slug: 'campaign-100', ownerId: 1 },
      })
      expect(campaignsService.findFirst).toHaveBeenCalledWith({
        where: { organizationSlug: 'campaign-100', userId: 1 },
        include: {},
      })
      const req = ctx.switchToHttp().getRequest() as {
        campaign?: Campaign
      }
      expect(req.campaign).toEqual(mockCampaign)
    })

    it('uses custom include when specified', async () => {
      const include = { organization: true, user: true }
      mockMetadata({ include })
      mockOrgFindFirst.mockResolvedValue({ slug: 'campaign-100', ownerId: 1 })
      vi.spyOn(campaignsService, 'findFirst').mockResolvedValue(mockCampaign)

      const ctx = buildContext({
        headers: { 'x-organization-slug': 'campaign-100' },
      })
      await guard.canActivate(ctx)

      expect(campaignsService.findFirst).toHaveBeenCalledWith({
        where: { organizationSlug: 'campaign-100', userId: 1 },
        include: { organization: true, user: true },
      })
    })

    it('throws NotFoundException when org has no campaign', async () => {
      mockMetadata()
      mockOrgFindFirst.mockResolvedValue({ slug: 'campaign-100', ownerId: 1 })
      vi.spyOn(campaignsService, 'findFirst').mockResolvedValue(null)

      const ctx = buildContext({
        headers: { 'x-organization-slug': 'campaign-100' },
      })

      await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException)
    })

    it('throws NotFoundException when org not found', async () => {
      mockMetadata()
      mockOrgFindFirst.mockResolvedValue(null)
      vi.spyOn(campaignsService, 'findFirst').mockResolvedValue(null)

      const ctx = buildContext({
        headers: { 'x-organization-slug': 'nonexistent' },
      })

      await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException)
    })

    it('throws NotFoundException when ownerId does not match', async () => {
      mockMetadata()
      mockOrgFindFirst.mockResolvedValue(null)
      vi.spyOn(campaignsService, 'findFirst').mockResolvedValue(null)

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
        campaign?: Campaign
      }
      expect(req.campaign).toBeUndefined()
    })
  })
})
