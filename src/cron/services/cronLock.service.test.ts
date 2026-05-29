import { beforeEach, describe, expect, it } from 'vitest'
import { useTestService } from '@/test-service'
import { CronLockService } from './cronLock.service'

const service = useTestService()

describe('CronLockService.tryClaimDailyRun', () => {
  beforeEach(async () => {
    await service.prisma.cronRun.deleteMany({})
  })

  it('grants the first caller and denies a second caller for the same UTC day', async () => {
    const lock = service.app.get(CronLockService)
    const now = new Date('2026-05-29T07:00:00.000Z')

    expect(await lock.tryClaimDailyRun('jobX', now)).toBe(true)
    expect(await lock.tryClaimDailyRun('jobX', now)).toBe(false)
  })

  it('treats different times on the same UTC date as the same claim', async () => {
    const lock = service.app.get(CronLockService)

    expect(
      await lock.tryClaimDailyRun('jobX', new Date('2026-05-29T00:00:01.000Z')),
    ).toBe(true)
    expect(
      await lock.tryClaimDailyRun('jobX', new Date('2026-05-29T23:59:59.000Z')),
    ).toBe(false)
  })

  it('grants the claim again on a different UTC day', async () => {
    const lock = service.app.get(CronLockService)

    expect(
      await lock.tryClaimDailyRun('jobX', new Date('2026-05-29T12:00:00.000Z')),
    ).toBe(true)
    expect(
      await lock.tryClaimDailyRun('jobX', new Date('2026-05-30T12:00:00.000Z')),
    ).toBe(true)
  })

  it('isolates claims per jobName', async () => {
    const lock = service.app.get(CronLockService)
    const now = new Date('2026-05-29T07:00:00.000Z')

    expect(await lock.tryClaimDailyRun('jobA', now)).toBe(true)
    expect(await lock.tryClaimDailyRun('jobB', now)).toBe(true)
  })
})
