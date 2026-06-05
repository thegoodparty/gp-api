import { ROLES_KEY } from '@/authentication/decorators/Roles.decorator'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { UserRole } from '../../generated/prisma'
import { describe, expect, it, vi } from 'vitest'
import { PositionsController } from './positions.controller'
import { PositionsService } from './positions.service'

function getRoles(
  methodName: keyof PositionsController,
): UserRole[] | undefined {
  return Reflect.getMetadata(
    ROLES_KEY,
    PositionsController.prototype[methodName],
  )
}

describe('PositionsController', () => {
  const positionsService = {
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as PositionsService

  const controller = new PositionsController(
    positionsService,
    createMockLogger(),
  )

  describe('role guards', () => {
    it('does not require a role for list', () => {
      expect(getRoles('list')).toBeUndefined()
    })

    it('requires admin role for create', () => {
      expect(getRoles('create')).toEqual([UserRole.admin])
    })

    it('requires admin role for update', () => {
      expect(getRoles('update')).toEqual([UserRole.admin])
    })

    it('requires admin role for delete', () => {
      expect(getRoles('delete')).toEqual([UserRole.admin])
    })
  })

  describe('delete', () => {
    it('awaits the service and returns undefined', async () => {
      positionsService.delete = vi.fn().mockResolvedValue({})
      const result = await controller.delete(1)
      expect(result).toBeUndefined()
      expect(positionsService.delete).toHaveBeenCalledWith(1)
    })
  })
})
