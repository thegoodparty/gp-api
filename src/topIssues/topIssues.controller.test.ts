import { ROLES_KEY } from '@/authentication/decorators/Roles.decorator'
import { UserRole } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { TopIssuesController } from './topIssues.controller'
import { TopIssuesService } from './topIssues.service'

function getRoles(
  methodName: keyof TopIssuesController,
): UserRole[] | undefined {
  return Reflect.getMetadata(
    ROLES_KEY,
    TopIssuesController.prototype[methodName],
  )
}

describe('TopIssuesController', () => {
  const topIssuesService = {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getByLocation: vi.fn(),
  } as unknown as TopIssuesService

  const controller = new TopIssuesController(topIssuesService)

  describe('role guards', () => {
    it('does not require a role for listTopIssues', () => {
      expect(getRoles('listTopIssues')).toBeUndefined()
    })

    it('does not require a role for getByLocation', () => {
      expect(getRoles('getByLocation')).toBeUndefined()
    })

    it('requires admin role for createTopIssue', () => {
      expect(getRoles('createTopIssue')).toEqual([UserRole.admin])
    })

    it('requires admin role for updateTopIssue', () => {
      expect(getRoles('updateTopIssue')).toEqual([UserRole.admin])
    })

    it('requires admin role for deleteTopIssue', () => {
      expect(getRoles('deleteTopIssue')).toEqual([UserRole.admin])
    })
  })

  describe('deleteTopIssue', () => {
    it('awaits the service and returns undefined', async () => {
      topIssuesService.delete = vi.fn().mockResolvedValue({})
      const result = await controller.deleteTopIssue(1)
      expect(result).toBeUndefined()
      expect(topIssuesService.delete).toHaveBeenCalledWith(1)
    })
  })
})
