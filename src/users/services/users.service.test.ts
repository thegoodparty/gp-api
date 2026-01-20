import { useTestService } from '@/test-service'
import { beforeEach, describe, expect, it } from 'vitest'
import { UsersService } from './users.service'

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
})
