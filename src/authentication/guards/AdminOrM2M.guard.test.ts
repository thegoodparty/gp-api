import { ExecutionContext } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { AdminOrM2MGuard } from './AdminOrM2M.guard'

describe('AdminOrM2MGuard', () => {
  const guard = new AdminOrM2MGuard()

  const mockContext = (req: object) =>
    ({
      switchToHttp: () => ({ getRequest: () => req }),
    }) as ExecutionContext

  it('allows M2M token requests', () => {
    const result = guard.canActivate(mockContext({ m2mToken: {} }))
    expect(result).toBe(true)
  })

  it('allows admin user requests', () => {
    const result = guard.canActivate(
      mockContext({ user: { roles: [UserRole.admin] } }),
    )
    expect(result).toBe(true)
  })

  it('allows requests with both M2M token and admin user', () => {
    const result = guard.canActivate(
      mockContext({ m2mToken: {}, user: { roles: [UserRole.admin] } }),
    )
    expect(result).toBe(true)
  })

  it('rejects non-admin user requests', () => {
    const result = guard.canActivate(
      mockContext({ user: { roles: [UserRole.candidate] } }),
    )
    expect(result).toBe(false)
  })

  it('rejects requests with no M2M token and no user', () => {
    const result = guard.canActivate(mockContext({}))
    expect(result).toBe(false)
  })

  it('rejects requests with user but no roles', () => {
    const result = guard.canActivate(mockContext({ user: {} }))
    expect(result).toBe(false)
  })
})
