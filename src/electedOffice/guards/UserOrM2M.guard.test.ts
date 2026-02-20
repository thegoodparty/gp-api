import { ExecutionContext } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { UserOrM2MGuard } from './UserOrM2M.guard'

describe('UserOrM2MGuard', () => {
  const guard = new UserOrM2MGuard()

  const mockContext = (req: object) =>
    ({
      switchToHttp: () => ({ getRequest: () => req }),
    }) as ExecutionContext

  it('allows M2M token requests', () => {
    const result = guard.canActivate(mockContext({ m2mToken: {} }))
    expect(result).toBe(true)
  })

  it('allows authenticated user requests', () => {
    const result = guard.canActivate(mockContext({ user: { id: 1 } }))
    expect(result).toBe(true)
  })

  it('allows requests with both M2M token and user', () => {
    const result = guard.canActivate(
      mockContext({ m2mToken: {}, user: { id: 1 } }),
    )
    expect(result).toBe(true)
  })

  it('rejects requests with no M2M token and no user', () => {
    const result = guard.canActivate(mockContext({}))
    expect(result).toBe(false)
  })
})
