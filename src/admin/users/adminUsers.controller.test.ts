import { BadRequestException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminUsersController } from './adminUsers.controller'
import { UsersService } from 'src/users/services/users.service'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { AuthenticationService } from 'src/authentication/authentication.service'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'

const mockUser = {
  id: 5,
  email: 'candidate@example.com',
  firstName: 'Jane',
  lastName: 'Doe',
  phone: '5551234567',
  avatar: null,
  hasPassword: false,
  roles: [],
  metaData: null,
}

describe('AdminUsersController', () => {
  let controller: AdminUsersController
  let mockUsersService: {
    findUserByEmail: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    findUniqueOrThrow: ReturnType<typeof vi.fn>
    createUser: ReturnType<typeof vi.fn>
    deleteUser: ReturnType<typeof vi.fn>
  }
  let mockAuthService: {
    generateAuthToken: ReturnType<typeof vi.fn>
  }
  let mockCampaignsService: { deleteAll: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    mockUsersService = {
      findUserByEmail: vi.fn(),
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      createUser: vi.fn(),
      deleteUser: vi.fn(),
    }

    mockAuthService = {
      generateAuthToken: vi.fn().mockResolvedValue('jwt-token'),
    }

    mockCampaignsService = {
      deleteAll: vi.fn(),
    }

    controller = new AdminUsersController(
      mockUsersService as unknown as UsersService,
      mockCampaignsService as unknown as CampaignsService,
      mockAuthService as unknown as AuthenticationService,
      {} as SlackService,
      createMockLogger(),
    )
  })

  describe('impersonate', () => {
    it('generates a token with impersonating: true', async () => {
      mockUsersService.findUserByEmail.mockResolvedValue(mockUser)

      await controller.impersonate({ email: 'candidate@example.com' })

      expect(mockAuthService.generateAuthToken).toHaveBeenCalledWith({
        email: 'candidate@example.com',
        sub: 5,
        impersonating: true,
      })
    })

    it('returns the generated token and parsed user', async () => {
      mockUsersService.findUserByEmail.mockResolvedValue(mockUser)
      mockAuthService.generateAuthToken.mockResolvedValue('impersonation-jwt')

      const result = await controller.impersonate({
        email: 'candidate@example.com',
      })

      expect(result.token).toBe('impersonation-jwt')
      expect(result.user).toBeDefined()
    })

    it('throws BadRequestException when user is not found', async () => {
      mockUsersService.findUserByEmail.mockResolvedValue(null)

      await expect(
        controller.impersonate({ email: 'nobody@example.com' }),
      ).rejects.toThrow(BadRequestException)
    })
  })
})
