import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { formatInTimeZone } from 'date-fns-tz'
import { createPrismaBase, MODELS } from '@/prisma/util/prisma.util'
import { parseIsoDateAsUTC } from '@/shared/util/date.util'

const PRISMA_UNIQUE_VIOLATION = 'P2002'

@Injectable()
export class CronLockService extends createPrismaBase(MODELS.CronRun) {
  /**
   * Claims the once-per-day run slot for `jobName`. Returns `true` if this
   * process won the claim and should run the job, `false` if another process
   * (e.g. a second ECS replica firing the same @Cron) already claimed it for
   * the same UTC calendar date.
   *
   * The `(jobName, runDate)` unique constraint is the lock: the first insert
   * wins, concurrent inserts get a unique violation. This is durable and
   * pooling-safe — unlike a session advisory lock it cannot leak and block a
   * future day's run.
   *
   * @param now Defaults to the current time; injectable for tests.
   */
  async tryClaimDailyRun(
    jobName: string,
    now: Date = new Date(),
  ): Promise<boolean> {
    const runDate = parseIsoDateAsUTC(
      formatInTimeZone(now, 'UTC', 'yyyy-MM-dd'),
    )

    try {
      await this.model.create({ data: { jobName, runDate } })
      this.logger.info({ jobName, runDate }, 'claimed daily cron run')
      return true
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === PRISMA_UNIQUE_VIOLATION
      ) {
        this.logger.info(
          { jobName, runDate },
          'daily cron run already claimed by another instance; skipping',
        )
        return false
      }
      throw err
    }
  }
}
