import { Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { addDays, nextMonday } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { PinoLogger } from 'nestjs-pino'
import { QueueProducerService } from 'src/queue/producer/queueProducer.service'
import { MessageGroup, QueueType } from 'src/queue/queue.types'

const CENTRAL_TIMEZONE = 'America/Chicago'

// Task dates are stored as calendar dates (e.g. "2026-04-20 00:00:00"). To
// filter Monday-through-Sunday of the upcoming week, we need windowStart and
// windowEnd to be UTC midnight of the calendar date, regardless of DST.
function nextMondayUtcMidnight(now: Date, timeZone: string): Date {
  // Shift the current instant into the target timezone so nextMonday() picks
  // the right calendar Monday (e.g. Sunday 11pm Central is still "Sunday" in
  // Central, but "Monday" in UTC — we want Central's view).
  const nowInZone = toZonedTime(now, timeZone)
  const monday = nextMonday(nowInZone)
  // Reconstruct as UTC midnight of that calendar date so the window aligns
  // with how tasks are stored (naive timestamps at midnight UTC).
  return new Date(
    Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()),
  )
}


@Injectable()
export class WeeklyTasksDigestService {
  constructor(
    private readonly queueService: QueueProducerService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(WeeklyTasksDigestService.name)
  }

  // Every Sunday at 11 PM Central Time
  @Cron('0 23 * * 0', {
    name: 'weeklyTasksDigest',
    timeZone: CENTRAL_TIMEZONE,
  })
  async triggerWeeklyDigest() {
    const windowStart = nextMondayUtcMidnight(new Date(), CENTRAL_TIMEZONE)
    const windowEnd = addDays(windowStart, 7)

    this.logger.info(
      { windowStart, windowEnd },
      'Triggering weekly tasks digest',
    )

    // Every ECS instance runs its own @Cron, so all of them enqueue a message
    // when this fires. We use a deterministic deduplicationId derived from
    // windowStart so SQS FIFO collapses them into a single message (within
    // the 5-minute dedup window), ensuring the handler runs once per week.
    await this.queueService.sendMessage(
      {
        type: QueueType.WEEKLY_TASKS_DIGEST,
        data: {
          windowStart: windowStart.toISOString(),
          windowEnd: windowEnd.toISOString(),
        },
      },
      MessageGroup.weeklyTasksDigest,
      {
        deduplicationId: `weeklyTasksDigest-${windowStart.toISOString()}`,
      },
    )
  }
}
