import { beforeEach, describe, expect, it } from 'vitest'
import { useTestService } from '@/test-service'
import { CronLockService } from './cronLock.service'

const service = useTestService()

const JOB = 'jobX'

describe('CronLockService.tryClaimDailyRun', () => {
  beforeEach(async () => {
    await service.prisma.cronRun.deleteMany({})
  })

  it('grants the first caller and denies a second caller for the same UTC day', async () => {
    const lock = service.app.get(CronLockService)
    const now = new Date('2026-05-29T07:00:00.000Z')

    expect(await lock.tryClaimDailyRun(JOB, now)).toBe(true)
    expect(await lock.tryClaimDailyRun(JOB, now)).toBe(false)
  })

  it('treats different times on the same UTC date as the same claim', async () => {
    const lock = service.app.get(CronLockService)

    // Two times on the same UTC date, within the staleness window so the active
    // claim is not eligible for takeover.
    expect(
      await lock.tryClaimDailyRun(JOB, new Date('2026-05-29T00:00:01.000Z')),
    ).toBe(true)
    expect(
      await lock.tryClaimDailyRun(JOB, new Date('2026-05-29T04:00:00.000Z')),
    ).toBe(false)
  })

  it('grants the claim again on a different UTC day', async () => {
    const lock = service.app.get(CronLockService)

    expect(
      await lock.tryClaimDailyRun(JOB, new Date('2026-05-29T12:00:00.000Z')),
    ).toBe(true)
    expect(
      await lock.tryClaimDailyRun(JOB, new Date('2026-05-30T12:00:00.000Z')),
    ).toBe(true)
  })

  it('isolates claims per jobName', async () => {
    const lock = service.app.get(CronLockService)
    const now = new Date('2026-05-29T07:00:00.000Z')

    expect(await lock.tryClaimDailyRun('jobA', now)).toBe(true)
    expect(await lock.tryClaimDailyRun('jobB', now)).toBe(true)
  })

  it('does not take over an in-progress (not yet stale) claim', async () => {
    const lock = service.app.get(CronLockService)

    expect(
      await lock.tryClaimDailyRun(JOB, new Date('2026-05-29T07:00:00.000Z')),
    ).toBe(true)
    // 2 hours later, same day: prior claim is still within the staleness window.
    expect(
      await lock.tryClaimDailyRun(JOB, new Date('2026-05-29T09:00:00.000Z')),
    ).toBe(false)
  })

  it('takes over a stale claim that never completed (crashed run)', async () => {
    const lock = service.app.get(CronLockService)

    expect(
      await lock.tryClaimDailyRun(JOB, new Date('2026-05-29T07:00:00.000Z')),
    ).toBe(true)
    // 7 hours later (> STALE_CLAIM_MS) with no markCompleted: assume a crash.
    expect(
      await lock.tryClaimDailyRun(JOB, new Date('2026-05-29T14:00:00.000Z')),
    ).toBe(true)
  })

  it('never takes over a completed claim, even when stale', async () => {
    const lock = service.app.get(CronLockService)
    const now = new Date('2026-05-29T07:00:00.000Z')

    expect(await lock.tryClaimDailyRun(JOB, now)).toBe(true)
    await lock.markCompleted(JOB, now)

    // Long after completion, same day: a completed run must not be retried.
    expect(
      await lock.tryClaimDailyRun(JOB, new Date('2026-05-29T20:00:00.000Z')),
    ).toBe(false)
  })
})
