import { useTestService } from '@/test-service'
import { CLERK_CLIENT_PROVIDER_TOKEN } from '@/vendors/clerk/providers/clerk-client.provider'
import { ClerkClient, User } from '@clerk/backend'
import { BadGatewayException, BadRequestException } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { subHours } from 'date-fns'
import ms from 'ms'
import { UsersService } from './users.service'
import { AnalyticsService } from '@/analytics/analytics.service'
import { StripeService } from '@/vendors/stripe/services/stripe.service'

const service = useTestService()

describe('UsersService', () => {
  let usersService: UsersService

  beforeEach(async () => {
    usersService = service.app.get(UsersService)
  })

  describe('findUserByEmail', () => {
    it('should find user with exact email match', async () => {
      const user = await usersService.findUserByEmail('tests@goodparty.org')
      expect(user).not.toBeNull()
      expect(user?.id).toBe(service.user.id)
    })

    it('should find user with case-insensitive email', async () => {
      const user = await usersService.findUserByEmail('TESTS@GOODPARTY.ORG')
      expect(user).not.toBeNull()
      expect(user?.id).toBe(service.user.id)
    })

    it('should find user with mixed case email', async () => {
      const user = await usersService.findUserByEmail('Tests@GoodParty.Org')
      expect(user).not.toBeNull()
      expect(user?.id).toBe(service.user.id)
    })

    it('should return null for non-existent email', async () => {
      const user = await usersService.findUserByEmail('nonexistent@example.com')
      expect(user).toBeNull()
    })
  })

  describe('patchUserMetaData', () => {
    it('should set metadata on user with no existing metadata', async () => {
      const updated = await usersService.patchUserMetaData(service.user.id, {
        sessionCount: 5,
      })

      expect(updated.metaData).toEqual({ sessionCount: 5 })
    })

    it('should merge new metadata with existing metadata', async () => {
      // Set initial metadata
      await usersService.patchUserMetaData(service.user.id, {
        sessionCount: 1,
        lastVisited: 1000,
      })

      // Patch with new data
      const updated = await usersService.patchUserMetaData(service.user.id, {
        customerId: 'cus_123',
      })

      expect(updated.metaData).toEqual({
        sessionCount: 1,
        lastVisited: 1000,
        customerId: 'cus_123',
      })
    })

    it('should overwrite existing keys when patching', async () => {
      await usersService.patchUserMetaData(service.user.id, {
        sessionCount: 1,
      })

      const updated = await usersService.patchUserMetaData(service.user.id, {
        sessionCount: 10,
      })

      expect(updated.metaData).toEqual({ sessionCount: 10 })
    })

    it('should not lose metadata for racing requests', async () => {
      // Run multiple concurrent updates, each adding a unique key
      const updates = Array.from({ length: 5 }, (_, i) => ({
        [`key${i}`]: `value${i}`,
      }))

      const results = await Promise.allSettled(
        updates.map((metadata) =>
          usersService.patchUserMetaData(service.user.id, metadata),
        ),
      )

      // All updates should succeed (with retries if needed)
      for (const result of results) {
        expect(result).toMatchObject({ status: 'fulfilled' })
      }

      // All values should be preserved - no data loss from race conditions
      const user = await usersService.findUser({ id: service.user.id })
      expect(user?.metaData).toMatchObject({
        key0: 'value0',
        key1: 'value1',
        key2: 'value2',
        key3: 'value3',
        key4: 'value4',
      })
    })
  })

  describe('findByCustomerId', () => {
    it('should find user by customerId in metadata', async () => {
      await usersService.patchUserMetaData(service.user.id, {
        customerId: 'cus_test_123',
      })

      const found = await usersService.findByCustomerId('cus_test_123')
      expect(found).not.toBeNull()
      expect(found?.id).toBe(service.user.id)
    })

    it('should return null for non-existent customerId', async () => {
      const found = await usersService.findByCustomerId('cus_nonexistent')
      expect(found).toBeNull()
    })
  })

  describe('updatePassword', () => {
    it('should hash and update the password', async () => {
      const originalUser = await usersService.findUser({ id: service.user.id })
      expect(originalUser?.password).toBeNull()

      await usersService.updatePassword(service.user.id, 'newPassword123')

      const updatedUser = await usersService.findUser({ id: service.user.id })
      expect(updatedUser?.password).not.toBeNull()
      expect(updatedUser?.password).not.toBe('newPassword123') // Should be hashed
    })

    it('should clear reset token when specified', async () => {
      await usersService.setResetToken(service.user.id, 'reset-token-123')

      let user = await usersService.findUser({ id: service.user.id })
      expect(user?.passwordResetToken).toBe('reset-token-123')

      await usersService.updatePassword(service.user.id, 'newPassword', true)

      user = await usersService.findUser({ id: service.user.id })
      expect(user?.passwordResetToken).toBeNull()
    })
  })

  describe('setResetToken', () => {
    it('should set the password reset token', async () => {
      await usersService.setResetToken(service.user.id, 'my-reset-token')

      const user = await usersService.findUser({ id: service.user.id })
      expect(user?.passwordResetToken).toBe('my-reset-token')
    })
  })

  describe('findUserByResetToken', () => {
    it('should find user by email and reset token', async () => {
      await usersService.setResetToken(service.user.id, 'valid-token')

      const user = await usersService.findUserByResetToken(
        'tests@goodparty.org',
        'valid-token',
      )
      expect(user.id).toBe(service.user.id)
    })

    it('should throw for invalid token', async () => {
      await usersService.setResetToken(service.user.id, 'valid-token')

      await expect(
        usersService.findUserByResetToken('tests@goodparty.org', 'wrong-token'),
      ).rejects.toThrow()
    })
  })

  describe('impersonateUser', () => {
    let clerkClient: ClerkClient

    beforeEach(() => {
      clerkClient = service.app.get<ClerkClient>(CLERK_CLIENT_PROVIDER_TOKEN)
    })

    it('returns an actor token when the target user has a clerkId', async () => {
      vi.spyOn(clerkClient.actorTokens, 'create').mockResolvedValue({
        token: 'actor_token_abc',
      } as Awaited<ReturnType<typeof clerkClient.actorTokens.create>>)

      const result = await usersService.impersonateUser(
        service.user.id,
        'user_actor_clerk_id',
      )

      expect(result).toEqual({ token: 'actor_token_abc' })
      expect(clerkClient.actorTokens.create).toHaveBeenCalledWith({
        userId: service.user.clerkId,
        actor: { sub: 'user_actor_clerk_id' },
        expiresInSeconds: 3600,
      })
    })

    it('throws BadRequestException when target user has no clerkId', async () => {
      const userWithoutClerkId = await service.prisma.user.create({
        data: {
          email: 'noclerk@example.com',
          firstName: 'No',
          lastName: 'Clerk',
          clerkId: null,
        },
      })

      await expect(
        usersService.impersonateUser(
          userWithoutClerkId.id,
          'user_actor_clerk_id',
        ),
      ).rejects.toThrow(BadRequestException)
    })

    it('throws BadRequestException with message when user has no clerkId', async () => {
      const userWithoutClerkId = await service.prisma.user.create({
        data: {
          email: 'noclerk2@example.com',
          firstName: 'No',
          lastName: 'Clerk',
          clerkId: null,
        },
      })

      await expect(
        usersService.impersonateUser(userWithoutClerkId.id, 'actor_id'),
      ).rejects.toThrow('User does not have an associated Clerk ID')
    })

    it('throws BadGatewayException when Clerk API call fails', async () => {
      vi.spyOn(clerkClient.actorTokens, 'create').mockRejectedValue(
        new Error('Clerk API unavailable'),
      )

      await expect(
        usersService.impersonateUser(service.user.id, 'user_actor_clerk_id'),
      ).rejects.toThrow(BadGatewayException)
    })

    it('throws BadGatewayException with message when Clerk API call fails', async () => {
      vi.spyOn(clerkClient.actorTokens, 'create').mockRejectedValue(
        new Error('Network error'),
      )

      await expect(
        usersService.impersonateUser(service.user.id, 'user_actor_clerk_id'),
      ).rejects.toThrow('Failed to create impersonation token')
    })

    it('throws BadGatewayException when Clerk returns no token', async () => {
      vi.spyOn(clerkClient.actorTokens, 'create').mockResolvedValue({
        token: null,
      } as unknown as Awaited<
        ReturnType<typeof clerkClient.actorTokens.create>
      >)

      await expect(
        usersService.impersonateUser(service.user.id, 'user_actor_clerk_id'),
      ).rejects.toThrow(BadGatewayException)
    })
  })

  describe('deleteUser', () => {
    let clerkClient: ClerkClient
    let analyticsService: AnalyticsService
    let stripeService: StripeService

    beforeEach(() => {
      clerkClient = service.app.get<ClerkClient>(CLERK_CLIENT_PROVIDER_TOKEN)
      analyticsService = service.app.get<AnalyticsService>(AnalyticsService)
      stripeService = service.app.get<StripeService>(StripeService)
    })

    it('deletes the DB record and calls clerkClient.users.deleteUser when user has a clerkId', async () => {
      const targetUser = await service.prisma.user.create({
        data: {
          email: 'delete-me@example.com',
          clerkId: 'clerk_delete_test_id',
        },
      })
      vi.spyOn(clerkClient.users, 'deleteUser').mockResolvedValue(
        {} as Awaited<ReturnType<typeof clerkClient.users.deleteUser>>,
      )
      vi.spyOn(analyticsService, 'track').mockResolvedValue(
        {} as Awaited<ReturnType<typeof analyticsService.track>>,
      )

      await usersService.deleteUser(targetUser.id, service.user.id)

      const found = await service.prisma.user.findUnique({
        where: { id: targetUser.id },
      })
      expect(found).toBeNull()
      expect(clerkClient.users.deleteUser).toHaveBeenCalledWith(
        'clerk_delete_test_id',
      )
    })

    it('deletes the DB record and skips Clerk when user has no clerkId', async () => {
      const targetUser = await service.prisma.user.create({
        data: {
          email: 'no-clerk@example.com',
          clerkId: null,
        },
      })
      const deleteUserSpy = vi
        .spyOn(clerkClient.users, 'deleteUser')
        .mockResolvedValue(
          {} as Awaited<ReturnType<typeof clerkClient.users.deleteUser>>,
        )
      vi.spyOn(analyticsService, 'track').mockResolvedValue(
        {} as Awaited<ReturnType<typeof analyticsService.track>>,
      )

      await usersService.deleteUser(targetUser.id, service.user.id)

      const found = await service.prisma.user.findUnique({
        where: { id: targetUser.id },
      })
      expect(found).toBeNull()
      expect(deleteUserSpy).not.toHaveBeenCalled()
    })

    it('rolls back DB delete and throws BadGatewayException when Clerk deleteUser fails', async () => {
      const targetUser = await service.prisma.user.create({
        data: {
          email: 'clerk-fail@example.com',
          clerkId: 'clerk_fail_id',
        },
      })
      vi.spyOn(clerkClient.users, 'deleteUser').mockRejectedValue(
        new Error('Clerk API error'),
      )

      await expect(
        usersService.deleteUser(targetUser.id, service.user.id),
      ).rejects.toThrow(BadGatewayException)

      const found = await service.prisma.user.findUnique({
        where: { id: targetUser.id },
      })
      expect(found).not.toBeNull()
    })

    it('fires Account - User Deleted event with self initiatedBy when user deletes their own account', async () => {
      const targetUser = await service.prisma.user.create({
        data: {
          email: 'self-delete@example.com',
          clerkId: null,
        },
      })
      const trackSpy = vi
        .spyOn(analyticsService, 'track')
        .mockResolvedValue(
          {} as Awaited<ReturnType<typeof analyticsService.track>>,
        )

      await usersService.deleteUser(targetUser.id, targetUser.id)

      expect(trackSpy).toHaveBeenCalledWith(
        targetUser.id,
        'Account - User Deleted',
        expect.not.objectContaining({ initiatedByUserId: expect.anything() }),
        expect.objectContaining({ email: targetUser.email }),
      )
    })

    it('fires Account - User Deleted event with admin initiatedBy when an admin deletes an account', async () => {
      const targetUser = await service.prisma.user.create({
        data: {
          email: 'admin-deleted@example.com',
          clerkId: null,
        },
      })
      const trackSpy = vi
        .spyOn(analyticsService, 'track')
        .mockResolvedValue(
          {} as Awaited<ReturnType<typeof analyticsService.track>>,
        )

      await usersService.deleteUser(targetUser.id, service.user.id)

      expect(trackSpy).toHaveBeenCalledWith(
        targetUser.id,
        'Account - User Deleted',
        expect.objectContaining({
          initiatedBy: 'admin',
          initiatedByUserId: service.user.id,
        }),
        expect.objectContaining({ email: targetUser.email }),
      )
    })

    it('does not fire analytics event when Clerk deletion fails', async () => {
      const targetUser = await service.prisma.user.create({
        data: {
          email: 'analytics-no-fire@example.com',
          clerkId: 'clerk_analytics_fail_id',
        },
      })
      vi.spyOn(clerkClient.users, 'deleteUser').mockRejectedValue(
        new Error('Clerk API error'),
      )
      const trackSpy = vi
        .spyOn(analyticsService, 'track')
        .mockResolvedValue(
          {} as Awaited<ReturnType<typeof analyticsService.track>>,
        )

      await expect(
        usersService.deleteUser(targetUser.id, service.user.id),
      ).rejects.toThrow(BadGatewayException)

      expect(trackSpy).not.toHaveBeenCalled()
    })

    it('does not cancel Stripe subscription when Clerk deletion fails and transaction rolls back', async () => {
      const targetUser = await service.prisma.user.create({
        data: {
          email: 'stripe-rollback@example.com',
          clerkId: 'clerk_stripe_rollback_id',
        },
      })
      await service.prisma.organization.create({
        data: {
          slug: `org-stripe-rollback-${targetUser.id}`,
          ownerId: targetUser.id,
          positionId: 'br-pos-stripe-test',
        },
      })
      await service.prisma.campaign.create({
        data: {
          userId: targetUser.id,
          slug: `stripe-rollback-${targetUser.id}`,
          organizationSlug: `org-stripe-rollback-${targetUser.id}`,
          details: { subscriptionId: 'sub_should_not_cancel' },
        },
      })

      vi.spyOn(clerkClient.users, 'deleteUser').mockRejectedValue(
        new Error('Clerk API error'),
      )
      const cancelSpy = vi
        .spyOn(stripeService, 'cancelSubscription')
        .mockResolvedValue(undefined as never)

      await expect(
        usersService.deleteUser(targetUser.id, service.user.id),
      ).rejects.toThrow(BadGatewayException)

      expect(cancelSpy).not.toHaveBeenCalled()
      const found = await service.prisma.user.findUnique({
        where: { id: targetUser.id },
      })
      expect(found).not.toBeNull()
    })
  })

  describe('deleteTestUsers', () => {
    let clerkClient: ClerkClient
    const ORIGINAL_ENV = process.env.OTEL_SERVICE_ENVIRONMENT

    const makeClerkUser = (overrides: {
      id: string
      email: string
      createdAt: number
    }): User =>
      ({
        id: overrides.id,
        createdAt: overrides.createdAt,
        primaryEmailAddress: { emailAddress: overrides.email },
        emailAddresses: [{ emailAddress: overrides.email }],
      }) as unknown as User

    const setGetUserListPages = (pages: User[][]) => {
      const spy = vi.spyOn(clerkClient.users, 'getUserList')
      pages.forEach((data) => {
        spy.mockResolvedValueOnce({
          data,
          totalCount: data.length,
        } as Awaited<ReturnType<typeof clerkClient.users.getUserList>>)
      })
      spy.mockResolvedValue({
        data: [],
        totalCount: 0,
      } as Awaited<ReturnType<typeof clerkClient.users.getUserList>>)
      return spy
    }

    beforeEach(() => {
      clerkClient = service.app.get<ClerkClient>(CLERK_CLIENT_PROVIDER_TOKEN)
      delete process.env.OTEL_SERVICE_ENVIRONMENT
      vi.spyOn(clerkClient.users, 'deleteUser').mockResolvedValue(
        {} as Awaited<ReturnType<typeof clerkClient.users.deleteUser>>,
      )
      vi.spyOn(clerkClient.users, 'getUserList').mockResolvedValue({
        data: [],
        totalCount: 0,
      } as Awaited<ReturnType<typeof clerkClient.users.getUserList>>)
    })

    afterEach(() => {
      if (ORIGINAL_ENV === undefined) {
        delete process.env.OTEL_SERVICE_ENVIRONMENT
      } else {
        process.env.OTEL_SERVICE_ENVIRONMENT = ORIGINAL_ENV
      }
    })

    it('pass 1: deletes old DB test users with clerkId from Clerk and DB', async () => {
      const user = await service.prisma.user.create({
        data: {
          email: 'test-1@test.goodparty.org',
          clerkId: 'clerk_test_1',
          createdAt: subHours(new Date(), 5),
        },
      })

      await usersService.deleteTestUsers()

      expect(clerkClient.users.deleteUser).toHaveBeenCalledWith('clerk_test_1')
      const found = await service.prisma.user.findUnique({
        where: { id: user.id },
      })
      expect(found).toBeNull()
    })

    it('pass 1: deletes DB user without clerkId and skips Clerk', async () => {
      const user = await service.prisma.user.create({
        data: {
          email: 'test-2@test.goodparty.org',
          clerkId: null,
          createdAt: subHours(new Date(), 5),
        },
      })

      await usersService.deleteTestUsers()

      expect(clerkClient.users.deleteUser).not.toHaveBeenCalled()
      const found = await service.prisma.user.findUnique({
        where: { id: user.id },
      })
      expect(found).toBeNull()
    })

    it('pass 1: leaves DB test users younger than 3h alone', async () => {
      const user = await service.prisma.user.create({
        data: {
          email: 'test-fresh@test.goodparty.org',
          clerkId: 'clerk_fresh',
          createdAt: new Date(Date.now() - ms('1h')),
        },
      })

      await usersService.deleteTestUsers()

      expect(clerkClient.users.deleteUser).not.toHaveBeenCalled()
      const found = await service.prisma.user.findUnique({
        where: { id: user.id },
      })
      expect(found).not.toBeNull()
    })

    it('pass 1: deletes DB row even when Clerk delete fails, and continues batch', async () => {
      vi.spyOn(clerkClient.users, 'deleteUser').mockRejectedValueOnce(
        new Error('Clerk API error'),
      )

      const failing = await service.prisma.user.create({
        data: {
          email: 'test-fail@test.goodparty.org',
          clerkId: 'clerk_fail',
          createdAt: subHours(new Date(), 5),
        },
      })
      const succeeding = await service.prisma.user.create({
        data: {
          email: 'test-succeed@test.goodparty.org',
          clerkId: 'clerk_succeed',
          createdAt: subHours(new Date(), 5),
        },
      })

      await usersService.deleteTestUsers()

      const foundFailing = await service.prisma.user.findUnique({
        where: { id: failing.id },
      })
      const foundSucceeding = await service.prisma.user.findUnique({
        where: { id: succeeding.id },
      })
      expect(foundFailing).toBeNull()
      expect(foundSucceeding).toBeNull()
      expect(clerkClient.users.deleteUser).toHaveBeenCalledTimes(2)
    })

    it('pass 2 (dev): deletes orphan Clerk users with no DB row', async () => {
      process.env.OTEL_SERVICE_ENVIRONMENT = 'dev'
      setGetUserListPages([
        [
          makeClerkUser({
            id: 'clerk_orphan',
            email: 'test-orphan@test.goodparty.org',
            createdAt: Date.now() - ms('5h'),
          }),
        ],
      ])

      await usersService.deleteTestUsers()

      expect(clerkClient.users.deleteUser).toHaveBeenCalledWith('clerk_orphan')
    })

    it('pass 2 (dev): skips Clerk users with a matching DB row', async () => {
      process.env.OTEL_SERVICE_ENVIRONMENT = 'dev'
      await service.prisma.user.create({
        data: {
          email: 'still-here@goodparty.org',
          clerkId: 'clerk_has_db_row',
          createdAt: new Date(Date.now() - ms('1h')),
        },
      })
      setGetUserListPages([
        [
          makeClerkUser({
            id: 'clerk_has_db_row',
            email: 'still-here@test.goodparty.org',
            createdAt: Date.now() - ms('5h'),
          }),
        ],
      ])

      await usersService.deleteTestUsers()

      expect(clerkClient.users.deleteUser).not.toHaveBeenCalled()
    })

    it('pass 2 (dev): skips Clerk users younger than 3h', async () => {
      process.env.OTEL_SERVICE_ENVIRONMENT = 'dev'
      setGetUserListPages([
        [
          makeClerkUser({
            id: 'clerk_fresh_orphan',
            email: 'fresh-orphan@test.goodparty.org',
            createdAt: Date.now() - ms('1h'),
          }),
        ],
      ])

      await usersService.deleteTestUsers()

      expect(clerkClient.users.deleteUser).not.toHaveBeenCalled()
    })

    it('pass 2 gate: does not paginate Clerk outside dev', async () => {
      process.env.OTEL_SERVICE_ENVIRONMENT = 'qa'
      const listSpy = setGetUserListPages([
        [
          makeClerkUser({
            id: 'clerk_orphan_qa',
            email: 'orphan-qa@test.goodparty.org',
            createdAt: Date.now() - ms('5h'),
          }),
        ],
      ])

      await usersService.deleteTestUsers()

      expect(listSpy).not.toHaveBeenCalled()
      expect(clerkClient.users.deleteUser).not.toHaveBeenCalled()
    })
  })
})
