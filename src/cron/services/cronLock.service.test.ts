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

  it('denies a second instance firing ~1s later the same day (two-replica race)', async () => {
    const lock = service.app.get(CronLockService)

    // The two ECS replicas fire their @Cron a fraction of a second apart. The
    // lock keys on the date only, so both resolve to the same runDate and only
    // the first wins — sub-second clock differences must not let both through.
    expect(
      await lock.tryClaimDailyRun(JOB, new Date('2026-05-29T07:00:00.123Z')),
    ).toBe(true)
    expect(
      await lock.tryClaimDailyRun(JOB, new Date('2026-05-29T07:00:01.456Z')),
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

  it('lets only one of two concurrent takeovers win', async () => {
    const lock = service.app.get(CronLockService)

    expect(
      await lock.tryClaimDailyRun(JOB, new Date('2026-05-29T07:00:00.000Z')),
    ).toBe(true)

    // Two replicas race to take over the same stale claim; the conditional
    // update must let exactly one succeed.
    const later = new Date('2026-05-29T14:00:00.000Z')
    const results = await Promise.all([
      lock.tryClaimDailyRun(JOB, later),
      lock.tryClaimDailyRun(JOB, later),
    ])

    expect(results.filter(Boolean)).toHaveLength(1)
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
