import { Injectable } from '@nestjs/common'
import { subMilliseconds } from 'date-fns'
import ms from 'ms'
import { createPrismaBase, MODELS } from '@/prisma/util/prisma.util'
import { isUniqueConstraintError } from '@/prisma/util/prismaErrors.util'
import { getMidnightForDate } from '@/shared/util/date.util'

// A claim that is still incomplete after this long is assumed to belong to a
// crashed run and may be taken over. Must comfortably exceed the longest a
// guarded job can legitimately run (the daily briefings loop batches with
// 20-minute sleeps and can take a few hours).
const STALE_CLAIM_MS = ms('6h')

@Injectable()
export class CronLockService extends createPrismaBase(MODELS.CronRun) {
  /**
   * Claims the once-per-day run slot for `jobName`. Returns `true` if this
   * process won the claim and should run the job, `false` if another process
   * (e.g. a second ECS replica firing the same @Cron) already holds an active
   * or completed claim for the same UTC calendar date.
   *
   * The `(jobName, runDate)` unique constraint is the lock: the first insert
   * wins, concurrent inserts get a unique violation. This is durable and
   * pooling-safe — unlike a session advisory lock it cannot leak and block a
   * future day's run.
   *
   * If a prior claim is still incomplete past {@link STALE_CLAIM_MS} the
   * claimer is assumed to have crashed, and the claim is atomically taken over
   * so the job can be retried instead of silently lost for the day. Callers
   * must invoke {@link markCompleted} once the job finishes.
   *
   * @param now Defaults to the current time; injectable for tests.
   */
  async tryClaimDailyRun(
    jobName: string,
    now: Date = new Date(),
  ): Promise<boolean> {
    const runDate = getMidnightForDate(now)

    try {
      // createdAt doubles as the claim timestamp for staleness checks, so set it
      // explicitly rather than relying on the DB default.
      await this.model.create({ data: { jobName, runDate, createdAt: now } })
      this.logger.info({ jobName, runDate }, 'claimed daily cron run')
      return true
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err

      // A row already exists. Take it over only if it never completed and its
      // claim is stale — refreshing createdAt so concurrent takeovers can't
      // both win (the conditional update matches at most one row).
      const cutoff = subMilliseconds(now, STALE_CLAIM_MS)
      const { count } = await this.model.updateMany({
        where: {
          jobName,
          runDate,
          completedAt: null,
          createdAt: { lt: cutoff },
        },
        data: { createdAt: now },
      })

      if (count > 0) {
        this.logger.warn(
          { jobName, runDate },
          'took over stale daily cron run claim (previous run never completed)',
        )
        return true
      }

      this.logger.info(
        { jobName, runDate },
        'daily cron run already claimed by another instance; skipping',
      )
      return false
    }
  }

  /**
   * Marks the current UTC day's claim for `jobName` as completed, so a later
   * invocation will not treat it as a crashed run and take it over.
   *
   * @param now Defaults to the current time; injectable for tests.
   */
  async markCompleted(jobName: string, now: Date = new Date()): Promise<void> {
    const runDate = getMidnightForDate(now)
    await this.model.updateMany({
      where: { jobName, runDate },
      data: { completedAt: now },
    })
  }
}
