import { useTestService } from '@/test-service'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UsersService } from '@/users/services/users.service'

const service = useTestService()

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('optimisticLockingUpdate', () => {
  // Just using polls as a test model because it's kinda simple
  let usersService: UsersService

  beforeEach(async () => {
    usersService = service.app.get(UsersService)
  })

  it('should protect against race conditions', async () => {
    const modificationFn = vi.fn()

    const [first, second] = await Promise.allSettled([
      // This one reads first but writes second (due to delay)
      usersService.optimisticLockingUpdate(
        { where: { id: service.user.id } },
        async (user) => {
          modificationFn('first', user)
          // Simulate slow processing -- this delay will cause the second update to win the race.
          await wait(100)
          if (user.zip === 'second') {
            throw new Error('second is set')
          }
          return { zip: 'first' }
        },
      ),
      // This one reads second but writes first (no delay)
      usersService.optimisticLockingUpdate(
        { where: { id: service.user.id } },
        async (user) => {
          // Delay very slightly so that this modification is always applied after the first one
          await wait(10)
          modificationFn('second', user)
          return { zip: 'second' }
        },
      ),
    ])

    // Confirm the second modification was applied in the end
    const final = await usersService.findUniqueOrThrow({
      where: { id: service.user.id },
    })
    expect(final.zip).toBe('second')

    expect(first).toStrictEqual({
      status: 'rejected',
      reason: expect.objectContaining({ message: 'second is set' }),
    })
    expect(second).toMatchObject({ status: 'fulfilled' })

    expect(modificationFn).toHaveBeenCalledTimes(3)
    expect(modificationFn).toHaveBeenNthCalledWith(
      1,
      'first',
      expect.objectContaining({ zip: null }),
    )
    expect(modificationFn).toHaveBeenNthCalledWith(
      2,
      'second',
      expect.objectContaining({ zip: null }),
    )
    expect(modificationFn).toHaveBeenNthCalledWith(
      3,
      'first',
      expect.objectContaining({ zip: 'second' }),
    )
  })

  it('should allow passing an empty object as the modification function', async () => {
    const initial = await usersService.findUniqueOrThrow({
      where: { id: service.user.id },
    })
    const result = await usersService.optimisticLockingUpdate(
      { where: { id: service.user.id } },
      () => {
        return {}
      },
    )
    expect(result).toMatchObject({ id: service.user.id })
    expect(result.updatedAt).not.toEqual(initial.updatedAt)
  })
})
