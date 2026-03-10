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
  createdAt: new Date(),
  updatedAt: new Date(),
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
      })
    })
  })

  describe('no header', () => {
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
})
