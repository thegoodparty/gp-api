import { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { User, UserRole } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/authentication/interfaces/auth-provider.interface'
import { IncomingRequest } from '@/authentication/authentication.types'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { SessionGuard } from './Session.guard'

const baseUser: User = {
  id: 1,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  firstName: 'Subject',
  lastName: 'User',
  name: 'Subject User',
  avatar: null,
  password: null,
  hasPassword: false,
  email: 'subject@example.com',
  phone: null,
  zip: null,
  roles: [UserRole.candidate],
  metaData: null,
  passwordResetToken: null,
  clerkId: 'user_subject_123',
}

const adminUser: User = {
  ...baseUser,
  id: 2,
  firstName: 'Admin',
  lastName: 'Actor',
  name: 'Admin Actor',
  email: 'admin@goodparty.org',
  roles: [UserRole.admin],
  clerkId: 'user_admin_456',
}

describe('SessionGuard — impersonating flag', () => {
  let guard: SessionGuard
  let authProvider: AuthProvider
  let usersService: { model: { findUnique: ReturnType<typeof vi.fn> } }
  let sessions: { trackSession: ReturnType<typeof vi.fn> }
  let clerkEnricher: {
    fetchClerkFields: ReturnType<typeof vi.fn>
  }

  const buildRequest = (token?: string): IncomingRequest =>
    ({
      headers: {
        authorization: token ? `Bearer ${token}` : undefined,
      },
    }) as unknown as IncomingRequest

  const buildContext = (req: IncomingRequest) =>
    ({
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as unknown as ExecutionContext

  beforeEach(() => {
    authProvider = {
      isM2MToken: vi.fn().mockReturnValue(false),
      verifySessionToken: vi.fn(),
      verifyM2MToken: vi.fn(),
      getUser: vi.fn(),
    }

    usersService = {
      model: { findUnique: vi.fn() },
    }

    sessions = { trackSession: vi.fn() }

    clerkEnricher = {
      fetchClerkFields: vi.fn().mockResolvedValue(null),
    }

    guard = new SessionGuard(
      authProvider,
      usersService as never,
      sessions as never,
      clerkEnricher as never,
      createMockLogger(),
      new Reflector(),
    )
  })

  it('sets impersonating=false when no actor claim', async () => {
    vi.mocked(authProvider.verifySessionToken).mockResolvedValue({
      externalUserId: baseUser.clerkId!,
    })
    usersService.model.findUnique.mockResolvedValue(baseUser)

    const req = buildRequest('session_token')
    await guard.canActivate(buildContext(req))

    expect(req.user?.impersonating).toBe(false)
    expect(req.actorUser).toBeUndefined()
  })

  it('sets impersonating=true when actor resolves to a user', async () => {
    vi.mocked(authProvider.verifySessionToken).mockResolvedValue({
      externalUserId: baseUser.clerkId!,
      actor: { sub: adminUser.clerkId! },
    })
    usersService.model.findUnique.mockImplementation(
      ({ where }: { where: { clerkId: string } }) =>
        where.clerkId === baseUser.clerkId!
          ? baseUser
          : where.clerkId === adminUser.clerkId!
            ? adminUser
            : null,
    )

    const req = buildRequest('session_token')
    await guard.canActivate(buildContext(req))

    expect(req.user?.impersonating).toBe(true)
    expect(req.actorUser).toEqual(
      expect.objectContaining({ clerkId: adminUser.clerkId! }),
    )
  })

  it('sets impersonating=false when actor.sub is not a user_ ID', async () => {
    vi.mocked(authProvider.verifySessionToken).mockResolvedValue({
      externalUserId: baseUser.clerkId!,
      actor: { sub: 'admin@goodparty.org' },
    })
    usersService.model.findUnique.mockResolvedValue(baseUser)

    const req = buildRequest('session_token')
    await guard.canActivate(buildContext(req))

    expect(req.user?.impersonating).toBe(false)
    expect(req.actorUser).toBeUndefined()
    expect(req.actorSub).toBe('admin@goodparty.org')
  })
})
