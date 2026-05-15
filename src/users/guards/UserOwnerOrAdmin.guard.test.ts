import { ExecutionContext } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { UserOwnerOrAdminGuard } from './UserOwnerOrAdmin.guard'

describe('UserOwnerOrAdminGuard', () => {
  const guard = new UserOwnerOrAdminGuard()

  const mockContext = (req: object) =>
    ({
      switchToHttp: () => ({ getRequest: () => req }),
    }) as ExecutionContext

  it('allows M2M token requests', () => {
    const result = guard.canActivate(
      mockContext({ m2mToken: {}, params: { id: '99' } }),
    )
    expect(result).toBe(true)
  })

  it('allows owner accessing own resource', () => {
    const result = guard.canActivate(
      mockContext({
        user: { id: 5, roles: [UserRole.candidate] },
        params: { id: '5' },
      }),
    )
    expect(result).toBe(true)
  })

  it('allows admin accessing another user', () => {
    const result = guard.canActivate(
      mockContext({
        user: { id: 1, roles: [UserRole.admin] },
        params: { id: '99' },
      }),
    )
    expect(result).toBe(true)
  })

  it('rejects non-owner non-admin', () => {
    const result = guard.canActivate(
      mockContext({
        user: { id: 5, roles: [UserRole.candidate] },
        params: { id: '99' },
      }),
    )
    expect(result).toBe(false)
  })

  it('rejects when no user and no M2M token', () => {
    const result = guard.canActivate(mockContext({ params: { id: '1' } }))
    expect(result).toBe(false)
  })

  it('rejects scientific notation that parseInt would misparse', () => {
    const result = guard.canActivate(
      mockContext({
        user: { id: 1, roles: [UserRole.candidate] },
        params: { id: '1e2' },
      }),
    )
    expect(result).toBe(false)
  })

  it('rejects trailing-text IDs that parseInt would misparse', () => {
    const result = guard.canActivate(
      mockContext({
        user: { id: 5, roles: [UserRole.candidate] },
        params: { id: '5abc' },
      }),
    )
    expect(result).toBe(false)
  })

  it('rejects non-numeric param', () => {
    const result = guard.canActivate(
      mockContext({
        user: { id: 1, roles: [UserRole.candidate] },
        params: { id: 'abc' },
      }),
    )
    expect(result).toBe(false)
  })
})
