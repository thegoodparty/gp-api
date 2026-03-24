import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthenticationService } from './authentication.service'
import { JwtService } from '@nestjs/jwt'
import { UsersService } from '../users/services/users.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'

describe('AuthenticationService', () => {
  describe('generateAuthToken - impersonation claim', () => {
    let service: AuthenticationService
    let signedPayload: Record<string, unknown>

    const mockJwtService = {
      sign: vi.fn((payload: Record<string, unknown>) => {
        signedPayload = payload
        return 'signed-token'
      }),
    }

    beforeEach(() => {
      service = new AuthenticationService(
        {} as UsersService,
        mockJwtService as unknown as JwtService,
        createMockLogger(),
      )
      vi.clearAllMocks()
    })

    it('includes impersonating: true in JWT payload when impersonating is true', () => {
      service.generateAuthToken({
        email: 'admin@example.com',
        sub: 1,
        impersonating: true,
      })

      expect(signedPayload).toEqual(
        expect.objectContaining({ impersonating: true }),
      )
    })

    it('does not include impersonating in JWT payload when omitted', () => {
      service.generateAuthToken({
        email: 'user@example.com',
        sub: 2,
      })

      expect(signedPayload).not.toHaveProperty('impersonating')
    })

    it('includes impersonating: false in JWT payload when explicitly false', () => {
      service.generateAuthToken({
        email: 'user@example.com',
        sub: 3,
        impersonating: false,
      })

      expect(signedPayload).toEqual(
        expect.objectContaining({ impersonating: false }),
      )
    })
  })
})
