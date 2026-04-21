import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { QueueProducerService } from 'src/queue/producer/queueProducer.service'
import { MessageGroup, QueueType } from 'src/queue/queue.types'
import { WeeklyTasksDigestService } from './weeklyTasksDigest.service'

describe('WeeklyTasksDigestService', () => {
  let service: WeeklyTasksDigestService
  let sendMessage: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sendMessage = vi.fn().mockResolvedValue(undefined)
    const queueService = {
      sendMessage,
    } as unknown as QueueProducerService

    service = new WeeklyTasksDigestService(queueService, createMockLogger())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('window calculation', () => {
    it('sends a window covering Monday Apr 20 through Sunday Apr 26 when today is Sunday Apr 19 Central', async () => {
      // Sunday April 19, 2026 at 11:00 PM Central Daylight Time = 04:00 UTC Monday April 20
      vi.setSystemTime(new Date('2026-04-20T04:00:00.000Z'))

      await service.triggerWeeklyDigest()

      expect(sendMessage).toHaveBeenCalledOnce()
      const [message] = sendMessage.mock.calls[0]
      expect(message.type).toBe(QueueType.WEEKLY_TASKS_DIGEST)
      expect(message.data.windowStart).toBe('2026-04-20T00:00:00.000Z')
      expect(message.data.windowEnd).toBe('2026-04-27T00:00:00.000Z')
    })

    it('still targets the same Monday when the cron fires later Sunday night (11:59 PM Central)', async () => {
      // Sunday April 19, 2026 at 11:59 PM CDT = 04:59 UTC Monday April 20
      vi.setSystemTime(new Date('2026-04-20T04:59:00.000Z'))

      await service.triggerWeeklyDigest()

      const [message] = sendMessage.mock.calls[0]
      expect(message.data.windowStart).toBe('2026-04-20T00:00:00.000Z')
      expect(message.data.windowEnd).toBe('2026-04-27T00:00:00.000Z')
    })

    it('uses the upcoming Monday when fired on Saturday night Central', async () => {
      // Saturday April 18, 2026 at 11:00 PM CDT = 04:00 UTC Sunday April 19
      vi.setSystemTime(new Date('2026-04-19T04:00:00.000Z'))

      await service.triggerWeeklyDigest()

      const [message] = sendMessage.mock.calls[0]
      expect(message.data.windowStart).toBe('2026-04-20T00:00:00.000Z')
      expect(message.data.windowEnd).toBe('2026-04-27T00:00:00.000Z')
    })

    it('handles standard time (non-DST) correctly', async () => {
      // Sunday January 4, 2026 at 11:00 PM CST = 05:00 UTC Monday January 5
      vi.setSystemTime(new Date('2026-01-05T05:00:00.000Z'))

      await service.triggerWeeklyDigest()

      const [message] = sendMessage.mock.calls[0]
      expect(message.data.windowStart).toBe('2026-01-05T00:00:00.000Z')
      expect(message.data.windowEnd).toBe('2026-01-12T00:00:00.000Z')
    })
  })

  describe('queue message', () => {
    it('sends to the weeklyTasksDigest message group', async () => {
      vi.setSystemTime(new Date('2026-04-20T04:00:00.000Z'))

      await service.triggerWeeklyDigest()

      const [, group] = sendMessage.mock.calls[0]
      expect(group).toBe(MessageGroup.weeklyTasksDigest)
    })

    it('uses a deterministic deduplicationId derived from windowStart so multiple ECS instances collapse to a single SQS message', async () => {
      vi.setSystemTime(new Date('2026-04-20T04:00:00.000Z'))

      await service.triggerWeeklyDigest()
      await service.triggerWeeklyDigest()

      const [, , optionsA] = sendMessage.mock.calls[0]
      const [, , optionsB] = sendMessage.mock.calls[1]
      expect(optionsA.deduplicationId).toBe(
        'weeklyTasksDigest-2026-04-20T00:00:00.000Z',
      )
      expect(optionsB.deduplicationId).toBe(optionsA.deduplicationId)
    })
  })
})
