import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { ExecutionContext, NotFoundException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Organization } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RequireOrganizationMetadata } from '../decorators/UseOrganization.decorator'
import { OrganizationsService } from '../services/organizations.service'
import { UseOrganizationGuard } from './UseOrganization.guard'

const mockOrg: Organization = {
  slug: 'campaign-100',
  ownerId: 1,
  positionId: null,
  overrideDistrictId: null,
  customPositionName: null,
}

describe('UseOrganizationGuard', () => {
  let guard: UseOrganizationGuard
  let organizationsService: OrganizationsService
  let reflector: Reflector

  function buildContext(
    headers: Record<string, string> = {},
    userId = 1,
  ): ExecutionContext {
    const req = { headers, user: { id: userId }, organization: undefined }
    return {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext
  }

  function mockMetadata(meta: RequireOrganizationMetadata = {}) {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(meta)
  }

  beforeEach(() => {
    organizationsService = {
      findFirst: vi.fn(),
      resolveCampaignSlug: vi.fn(),
      resolveElectedOfficeSlug: vi.fn(),
    } as unknown as OrganizationsService

    reflector = {
      getAllAndOverride: vi.fn().mockReturnValue({}),
    } as unknown as Reflector

    guard = new UseOrganizationGuard(
      organizationsService,
      reflector,
      createMockLogger(),
    )
  })

  describe('header present', () => {
    it('attaches org and returns true when org found', async () => {
      mockMetadata()
      vi.spyOn(organizationsService, 'findFirst').mockResolvedValue(mockOrg)

      const ctx = buildContext({ 'x-organization-slug': 'campaign-100' })
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
      expect(organizationsService.findFirst).toHaveBeenCalledWith({
        where: { slug: 'campaign-100', ownerId: 1 },
        include: undefined,
      })
      const req = ctx.switchToHttp().getRequest() as {
        organization?: Organization
      }
      expect(req.organization).toEqual(mockOrg)
    })

    it('throws NotFoundException when org not found', async () => {
      mockMetadata()
      vi.spyOn(organizationsService, 'findFirst').mockResolvedValue(null)

      const ctx = buildContext({ 'x-organization-slug': 'nonexistent' })

      await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException)
    })

    it('returns true without org when continueIfNotFound', async () => {
      mockMetadata({ continueIfNotFound: true })
      vi.spyOn(organizationsService, 'findFirst').mockResolvedValue(null)

      const ctx = buildContext({ 'x-organization-slug': 'nonexistent' })
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
      const req = ctx.switchToHttp().getRequest() as {
        organization?: Organization
      }
      expect(req.organization).toBeUndefined()
    })

    it('throws NotFoundException when ownerId does not match', async () => {
      mockMetadata()
      vi.spyOn(organizationsService, 'findFirst').mockResolvedValue(null)

      const ctx = buildContext({ 'x-organization-slug': 'campaign-100' }, 999)

      await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException)
      expect(organizationsService.findFirst).toHaveBeenCalledWith({
        where: { slug: 'campaign-100', ownerId: 999 },
        include: undefined,
      })
    })

    it('skips fallback when header is present', async () => {
      mockMetadata({ fallback: 'campaign' })
      vi.spyOn(organizationsService, 'findFirst').mockResolvedValue(mockOrg)

      const ctx = buildContext({ 'x-organization-slug': 'campaign-100' })
      await guard.canActivate(ctx)

      expect(organizationsService.resolveCampaignSlug).not.toHaveBeenCalled()
    })
  })

  describe('fallback: campaign', () => {
    it('derives slug from campaign and attaches org', async () => {
      mockMetadata({ fallback: 'campaign' })
      vi.spyOn(organizationsService, 'resolveCampaignSlug').mockResolvedValue(
        'campaign-100',
      )
      vi.spyOn(organizationsService, 'findFirst').mockResolvedValue(mockOrg)

      const ctx = buildContext()
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
      expect(organizationsService.resolveCampaignSlug).toHaveBeenCalledWith(1)
      expect(organizationsService.findFirst).toHaveBeenCalledWith({
        where: { slug: 'campaign-100', ownerId: 1 },
        include: undefined,
      })
      const req = ctx.switchToHttp().getRequest() as {
        organization?: Organization
      }
      expect(req.organization).toEqual(mockOrg)
    })

    it('throws NotFoundException when no campaign found', async () => {
      mockMetadata({ fallback: 'campaign' })
      vi.spyOn(organizationsService, 'resolveCampaignSlug').mockResolvedValue(
        null,
      )

      const ctx = buildContext()

      await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException)
    })

    it('returns true without org when no campaign and continueIfNotFound', async () => {
      mockMetadata({ fallback: 'campaign', continueIfNotFound: true })
      vi.spyOn(organizationsService, 'resolveCampaignSlug').mockResolvedValue(
        null,
      )

      const ctx = buildContext()
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
    })
  })

  describe('fallback: elected-office', () => {
    it('derives slug from elected office and attaches org', async () => {
      const eoOrg: Organization = { ...mockOrg, slug: 'eo-abc-123' }
      mockMetadata({ fallback: 'elected-office' })
      vi.spyOn(
        organizationsService,
        'resolveElectedOfficeSlug',
      ).mockResolvedValue('eo-abc-123')
      vi.spyOn(organizationsService, 'findFirst').mockResolvedValue(eoOrg)

      const ctx = buildContext()
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
      expect(
        organizationsService.resolveElectedOfficeSlug,
      ).toHaveBeenCalledWith(1)
      expect(organizationsService.findFirst).toHaveBeenCalledWith({
        where: { slug: 'eo-abc-123', ownerId: 1 },
        include: undefined,
      })
      const req = ctx.switchToHttp().getRequest() as {
        organization?: Organization
      }
      expect(req.organization).toEqual(eoOrg)
    })

    it('throws NotFoundException when no elected office found', async () => {
      mockMetadata({ fallback: 'elected-office' })
      vi.spyOn(
        organizationsService,
        'resolveElectedOfficeSlug',
      ).mockResolvedValue(null)

      const ctx = buildContext()

      await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException)
    })
  })

  describe('no header, no fallback', () => {
    it('throws NotFoundException', async () => {
      mockMetadata()

      const ctx = buildContext()

      await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException)
    })

    it('returns true when continueIfNotFound', async () => {
      mockMetadata({ continueIfNotFound: true })

      const ctx = buildContext()
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
    })
  })

  describe('include option', () => {
    it('passes include to findFirst', async () => {
      const include = { campaign: true, electedOffice: true }
      mockMetadata({ include })
      const orgWithRelations = {
        ...mockOrg,
        campaign: { id: 1 },
        electedOffice: { id: 'eo-1' },
      }
      vi.spyOn(organizationsService, 'findFirst').mockResolvedValue(
        orgWithRelations as never,
      )

      const ctx = buildContext({ 'x-organization-slug': 'campaign-100' })
      await guard.canActivate(ctx)

      expect(organizationsService.findFirst).toHaveBeenCalledWith({
        where: { slug: 'campaign-100', ownerId: 1 },
        include,
      })
    })

    it('throws when included relation is null on the resolved org', async () => {
      const include = { electedOffice: true }
      mockMetadata({ include })
      // Org exists but has no linked elected office
      const orgWithoutEo = { ...mockOrg, electedOffice: null }
      vi.spyOn(organizationsService, 'findFirst').mockResolvedValue(
        orgWithoutEo as never,
      )

      const ctx = buildContext({ 'x-organization-slug': 'campaign-100' })

      await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException)
      const req = ctx.switchToHttp().getRequest() as {
        organization?: Organization
      }
      expect(req.organization).toBeUndefined()
    })

    it('returns true when included relation is null and continueIfNotFound', async () => {
      const include = { electedOffice: true }
      mockMetadata({ include, continueIfNotFound: true })
      const orgWithoutEo = { ...mockOrg, electedOffice: null }
      vi.spyOn(organizationsService, 'findFirst').mockResolvedValue(
        orgWithoutEo as never,
      )

      const ctx = buildContext({ 'x-organization-slug': 'campaign-100' })
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
      const req = ctx.switchToHttp().getRequest() as {
        organization?: Organization
      }
      expect(req.organization).toBeUndefined()
    })

    it('attaches org when included relation is present', async () => {
      const include = { electedOffice: true }
      mockMetadata({ include })
      const orgWithEo = { ...mockOrg, electedOffice: { id: 'eo-1' } }
      vi.spyOn(organizationsService, 'findFirst').mockResolvedValue(
        orgWithEo as never,
      )

      const ctx = buildContext({ 'x-organization-slug': 'campaign-100' })
      const result = await guard.canActivate(ctx)

      expect(result).toBe(true)
      const req = ctx.switchToHttp().getRequest() as {
        organization?: Organization
      }
      expect(req.organization).toEqual(orgWithEo)
    })
  })
})
