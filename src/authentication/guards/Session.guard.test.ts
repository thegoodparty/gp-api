import { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { User, UserRole } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/authentication/interfaces/auth-provider.interface'
import { IncomingRequest } from '@/authentication/authentication.types'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { TRANSCRIBE_STREAM_PATH } from '@/speech/ws/speechToText.gateway'
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
  let usersService: {
    model: { findUnique: ReturnType<typeof vi.fn> }
  }
  let sessions: { trackSession: ReturnType<typeof vi.fn> }
  let clerkEnricher: {
    fetchClerkFields: ReturnType<typeof vi.fn>
  }

  const buildRequest = (
    token?: string,
    url = '/v1/protected',
  ): IncomingRequest =>
    ({
      url,
      headers: {
        authorization: token ? `Bearer ${token}` : undefined,
      },
    }) as unknown as IncomingRequest

  const buildContext = (req: IncomingRequest) =>
    ({
      switchToHttp: () => ({
        getRequest: () => req,
      }),
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

  it('allows the STT WebSocket upgrade without a token (ticket-authed)', async () => {
    const req = buildRequest(undefined, `${TRANSCRIBE_STREAM_PATH}?ticket=abc`)
    await expect(guard.canActivate(buildContext(req))).resolves.toBe(true)
    expect(authProvider.verifySessionToken).not.toHaveBeenCalled()
  })

  it('still rejects a protected route with no token', async () => {
    const req = buildRequest(undefined)
    await expect(guard.canActivate(buildContext(req))).rejects.toThrow()
  })

  it('no actor claim: impersonating=false, no actorUser', async () => {
    vi.mocked(authProvider.verifySessionToken).mockResolvedValue({
      externalUserId: baseUser.clerkId!,
    })
    usersService.model.findUnique.mockResolvedValue(baseUser)

    const req = buildRequest('tok')
    await guard.canActivate(buildContext(req))

    expect(req.user?.impersonating).toBe(false)
    expect(req.actorUser).toBeUndefined()
    expect(req.actorSub).toBeUndefined()
  })

  it('actor resolved: impersonating=true, actorUser set', async () => {
    vi.mocked(authProvider.verifySessionToken).mockResolvedValue({
      externalUserId: baseUser.clerkId!,
      actor: { sub: adminUser.clerkId! },
    })
    usersService.model.findUnique.mockImplementation(
      ({ where }: { where: { clerkId: string } }) =>
        where.clerkId === baseUser.clerkId
          ? baseUser
          : where.clerkId === adminUser.clerkId
            ? adminUser
            : null,
    )

    const req = buildRequest('tok')
    await guard.canActivate(buildContext(req))

    expect(req.user?.impersonating).toBe(true)
    expect(req.actorUser).toEqual(
      expect.objectContaining({
        clerkId: adminUser.clerkId,
      }),
    )
    expect(req.actorSub).toBe(adminUser.clerkId)
  })

  it('actor.sub is not a user_ ID: impersonating=false, actorUser absent', async () => {
    vi.mocked(authProvider.verifySessionToken).mockResolvedValue({
      externalUserId: baseUser.clerkId!,
      actor: { sub: 'admin@goodparty.org' },
    })
    usersService.model.findUnique.mockResolvedValue(baseUser)

    const req = buildRequest('tok')
    await guard.canActivate(buildContext(req))

    expect(req.user?.impersonating).toBe(false)
    expect(req.actorUser).toBeUndefined()
    expect(req.actorSub).toBe('admin@goodparty.org')
  })

  it('actor.sub is user_ but not in DB: impersonating=false, actorUser absent', async () => {
    vi.mocked(authProvider.verifySessionToken).mockResolvedValue({
      externalUserId: baseUser.clerkId!,
      actor: { sub: 'user_nonexistent_789' },
    })
    usersService.model.findUnique.mockImplementation(
      ({ where }: { where: { clerkId: string } }) =>
        where.clerkId === baseUser.clerkId ? baseUser : null,
    )

    const req = buildRequest('tok')
    await guard.canActivate(buildContext(req))

    expect(req.user?.impersonating).toBe(false)
    expect(req.actorUser).toBeUndefined()
    expect(req.actorSub).toBe('user_nonexistent_789')
  })
})
