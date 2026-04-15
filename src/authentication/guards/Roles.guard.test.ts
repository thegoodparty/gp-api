import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RolesGuard } from './Roles.guard'
import { Reflector } from '@nestjs/core'
import { ExecutionContext } from '@nestjs/common'
import { UserRole } from '@prisma/client'

function makeContext(user: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext
}

describe('RolesGuard', () => {
  let guard: RolesGuard
  let reflector: Reflector

  beforeEach(() => {
    reflector = { getAllAndOverride: vi.fn() } as unknown as Reflector
    guard = new RolesGuard(reflector)
  })

  it('allows when no roles are required', () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue(undefined)

    expect(guard.canActivate(makeContext({ roles: [] }))).toBe(true)
  })

  it('allows when user has a required role', () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue([
      UserRole.candidate,
    ])

    expect(
      guard.canActivate(
        makeContext({ roles: [UserRole.candidate] }),
      ),
    ).toBe(true)
  })

  it('rejects when user lacks the required role', () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue([
      UserRole.candidate,
      UserRole.admin,
    ])

    expect(
      guard.canActivate(makeContext({ roles: [UserRole.sales] })),
    ).toBe(false)
  })

  it('allows impersonating users regardless of role', () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue([
      UserRole.candidate,
      UserRole.admin,
    ])

    expect(
      guard.canActivate(
        makeContext({ roles: [UserRole.sales], impersonating: true }),
      ),
    ).toBe(true)
  })
})
