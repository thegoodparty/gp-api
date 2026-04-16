import { AdminOrM2MGuard } from '@/authentication/guards/AdminOrM2M.guard'
import { IncomingRequest } from '@/authentication/authentication.types'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { BadRequestException } from '@nestjs/common'
import { User, UserRole } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminUsersController } from './adminUsers.controller'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { UsersService } from 'src/users/services/users.service'
import { SlackService } from 'src/vendors/slack/services/slack.service'

const mockUser: User = {
  id: 1,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  firstName: 'Admin',
  lastName: 'User',
  name: 'Admin User',
  avatar: null,
  password: null,
  hasPassword: false,
  email: 'admin@goodparty.org',
  phone: '5555555555',
  zip: '12345',
  roles: [UserRole.admin],
  metaData: null,
  passwordResetToken: null,
  clerkId: 'user_admin_clerk_id',
}

const mockTargetUser: User = {
  ...mockUser,
  id: 42,
  email: 'candidate@example.com',
  roles: [UserRole.candidate],
  clerkId: 'user_target_clerk_id',
}

function getGuards(methodName: keyof AdminUsersController) {
  return (
    Reflect.getMetadata(
      '__guards__',
      AdminUsersController.prototype[methodName],
    ) ?? []
  )
}

describe('AdminUsersController', () => {
  let controller: AdminUsersController
  let usersService: UsersService
  let campaignsService: CampaignsService
  let slackService: SlackService

  beforeEach(() => {
    const usersServiceMock: Partial<UsersService> = {
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      createUser: vi.fn(),
      deleteUser: vi.fn(),
      impersonateUser: vi.fn(),
    }
    usersService = usersServiceMock as UsersService

    const campaignsServiceMock: Partial<CampaignsService> = {
      deleteAll: vi.fn(),
    }
    campaignsService = campaignsServiceMock as CampaignsService

    const slackServiceMock: Partial<SlackService> = {
      message: vi.fn(),
    }
    slackService = slackServiceMock as SlackService

    controller = new AdminUsersController(
      usersService,
      campaignsService,
      slackService,
      createMockLogger(),
    )
  })

  describe('guards', () => {
    it('protects impersonate with AdminOrM2MGuard', () => {
      const guards = getGuards('impersonate')
      expect(guards).toContain(AdminOrM2MGuard)
    })
  })

  describe('impersonate', () => {
    it('uses clerkId from the authenticated admin user when present', async () => {
      vi.spyOn(usersService, 'findUniqueOrThrow').mockResolvedValue(
        mockTargetUser,
      )
      vi.spyOn(usersService, 'impersonateUser').mockResolvedValue({
        token: 'actor_token_123',
      })

      const req = { user: mockUser } as IncomingRequest
      const result = await controller.impersonate(42, req, {})

      expect(usersService.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 42 },
      })
      expect(usersService.impersonateUser).toHaveBeenCalledWith(
        mockTargetUser.id,
        mockUser.clerkId,
      )
      expect(result).toEqual({ token: 'actor_token_123' })
    })

    it('falls back to body.actorClerkId when req.user has no clerkId', async () => {
      const adminWithoutClerkId = { ...mockUser, clerkId: null }
      vi.spyOn(usersService, 'findUniqueOrThrow').mockResolvedValue(
        mockTargetUser,
      )
      vi.spyOn(usersService, 'impersonateUser').mockResolvedValue({
        token: 'actor_token_456',
      })

      const req = { user: adminWithoutClerkId } as unknown as IncomingRequest
      const result = await controller.impersonate(42, req, {
        actorClerkId: 'm2m_actor_clerk_id',
      })

      expect(usersService.impersonateUser).toHaveBeenCalledWith(
        mockTargetUser.id,
        'm2m_actor_clerk_id',
      )
      expect(result).toEqual({ token: 'actor_token_456' })
    })

    it('uses body.actorClerkId when called via M2M (no req.user)', async () => {
      vi.spyOn(usersService, 'findUniqueOrThrow').mockResolvedValue(
        mockTargetUser,
      )
      vi.spyOn(usersService, 'impersonateUser').mockResolvedValue({
        token: 'm2m_token',
      })

      const req = { user: undefined } as IncomingRequest
      const result = await controller.impersonate(42, req, {
        actorClerkId: 'svc_clerk_id',
      })

      expect(usersService.impersonateUser).toHaveBeenCalledWith(
        mockTargetUser.id,
        'svc_clerk_id',
      )
      expect(result).toEqual({ token: 'm2m_token' })
    })

    it('throws BadRequestException when no actorClerkId can be resolved', async () => {
      const req = {
        user: { ...mockUser, clerkId: null },
      } as unknown as IncomingRequest

      await expect(controller.impersonate(42, req, {})).rejects.toThrow(
        BadRequestException,
      )

      expect(usersService.findUniqueOrThrow).not.toHaveBeenCalled()
      expect(usersService.impersonateUser).not.toHaveBeenCalled()
    })

    it('throws BadRequestException with descriptive message when actorClerkId is missing', async () => {
      const req = { user: undefined } as IncomingRequest

      await expect(controller.impersonate(42, req, {})).rejects.toThrow(
        'actorClerkId is required when using M2M auth',
      )
    })

    it('looks up target user by the path param id before impersonating', async () => {
      const differentTargetUser = { ...mockTargetUser, id: 99 }
      vi.spyOn(usersService, 'findUniqueOrThrow').mockResolvedValue(
        differentTargetUser,
      )
      vi.spyOn(usersService, 'impersonateUser').mockResolvedValue({
        token: 'tok',
      })

      const req = { user: mockUser } as IncomingRequest
      await controller.impersonate(99, req, {})

      expect(usersService.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 99 },
      })
      expect(usersService.impersonateUser).toHaveBeenCalledWith(
        99,
        mockUser.clerkId,
      )
    })
  })
})
