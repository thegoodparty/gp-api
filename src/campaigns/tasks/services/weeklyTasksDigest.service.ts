import { Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PinoLogger } from 'nestjs-pino'
import { QueueProducerService } from 'src/queue/producer/queueProducer.service'
import { MessageGroup, QueueType } from 'src/queue/queue.types'

const CENTRAL_TIMEZONE = 'America/Chicago'

// Task dates are stored as calendar dates (e.g. "2026-04-20 00:00:00"). To
// filter Monday-through-Sunday of the upcoming week, we need windowStart and
// windowEnd to be UTC midnight of the calendar date, regardless of DST.
function nextMondayUtcMidnight(now: Date, timeZone: string): Date {
  // Format the current instant in the target timezone as parts — this gives us
  // the calendar day the user is currently in.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  const day = Number(parts.find((p) => p.type === 'day')?.value)

  // Use the Central calendar day/month/year to find the weekday, regardless of
  // server timezone. getUTCDay() returns 0=Sun..6=Sat from pure date math,
  // no locale parsing.
  const weekdayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay()

  const daysUntilMonday = (1 - weekdayIndex + 7) % 7 || 7

  return new Date(Date.UTC(year, month - 1, day + daysUntilMonday))
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
    const windowEnd = new Date(windowStart)
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 7)

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
