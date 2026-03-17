import { UnauthorizedException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JwtAuthStrategy } from './JwtAuth.strategy'
import { UsersService } from '../../users/services/users.service'

const mockUser = {
  id: 42,
  email: 'voter@example.com',
  name: 'Test User',
}

describe('JwtAuthStrategy', () => {
  let strategy: JwtAuthStrategy
  let mockUsersService: { findUser: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.stubEnv('AUTH_SECRET', 'test-secret')

    mockUsersService = {
      findUser: vi.fn().mockResolvedValue(mockUser),
    }

    strategy = new JwtAuthStrategy(
      mockUsersService as unknown as UsersService,
    )
  })

  describe('validate - impersonation claim', () => {
    it('returns user with impersonating: true when JWT has impersonating: true', async () => {
      const result = await strategy.validate({
        sub: '42',
        impersonating: true,
      })

      expect(result).toEqual({ ...mockUser, impersonating: true })
    })

    it('returns user with impersonating: false when JWT has no impersonating claim', async () => {
      const result = await strategy.validate({ sub: '42' })

      expect(result).toEqual({ ...mockUser, impersonating: false })
    })

    it('returns user with impersonating: false when JWT has impersonating: false', async () => {
      const result = await strategy.validate({
        sub: '42',
        impersonating: false,
      })

      expect(result).toEqual({ ...mockUser, impersonating: false })
    })

    it('throws UnauthorizedException when user is not found', async () => {
      mockUsersService.findUser.mockResolvedValue(null)

      await expect(strategy.validate({ sub: '999' })).rejects.toThrow(
        UnauthorizedException,
      )
    })
  })
})
