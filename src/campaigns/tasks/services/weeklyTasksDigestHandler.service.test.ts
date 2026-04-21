import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CampaignTaskType } from '@prisma/client'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { EVENTS } from 'src/vendors/segment/segment.types'
import { WeeklyTasksDigestHandlerService } from './weeklyTasksDigestHandler.service'

const mockAnalytics: Partial<AnalyticsService> = {
  track: vi.fn().mockResolvedValue(undefined),
}

const mockQueryRaw = vi.fn()

const WINDOW_START = '2026-04-20T00:00:00.000Z'
const WINDOW_END = '2026-04-27T00:00:00.000Z'

const makeDigestRow = (overrides = {}) => ({
  campaign_id: 1,
  user_id: 100,
  completed_count: 0,
  incomplete_count: 3,
  slot: 1,
  title: 'Task',
  description: 'Description',
  flow_type: CampaignTaskType.education,
  date: new Date('2026-04-21T00:00:00.000Z'),
  week: 10,
  ...overrides,
})

describe('WeeklyTasksDigestHandlerService', () => {
  let service: WeeklyTasksDigestHandlerService

  beforeEach(() => {
    vi.clearAllMocks()

    service = new WeeklyTasksDigestHandlerService(
      mockAnalytics as AnalyticsService,
    )

    Object.defineProperty(service, '_prisma', {
      get: () => ({
        $queryRaw: mockQueryRaw,
      }),
    })
    Object.defineProperty(service, 'logger', {
      get: () => createMockLogger(),
    })
  })

  it('does not track when no eligible campaigns', async () => {
    mockQueryRaw.mockResolvedValueOnce([])

    await service.handleWeeklyTasksDigest({
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
    })

    expect(mockAnalytics.track).not.toHaveBeenCalled()
  })

  it('sends event with 3 tasks populated and slots 4/5 blank to clear stale HubSpot data', async () => {
    mockQueryRaw.mockResolvedValueOnce([
      makeDigestRow({
        slot: 1,
        title: 'Task A',
        flow_type: CampaignTaskType.text,
        completed_count: 1,
        incomplete_count: 3,
      }),
      makeDigestRow({
        slot: 2,
        title: 'Task B',
        flow_type: CampaignTaskType.doorKnocking,
        completed_count: 1,
        incomplete_count: 3,
      }),
      makeDigestRow({
        slot: 3,
        title: 'Task C',
        flow_type: CampaignTaskType.education,
        completed_count: 1,
        incomplete_count: 3,
      }),
    ])

    await service.handleWeeklyTasksDigest({
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
    })

    expect(mockAnalytics.track).toHaveBeenCalledOnce()
    const [, , properties] = (mockAnalytics.track as ReturnType<typeof vi.fn>)
      .mock.calls[0]

    expect(properties.plan_tasks_completed).toBe(1)
    expect(properties.plan_total_tasks).toBe(4)

    expect(properties.task_name_1).toBe('Task A')
    expect(properties.task_name_2).toBe('Task B')
    expect(properties.task_name_3).toBe('Task C')

    expect(properties.task_due_date_1).toBe('2026-04-21')
    expect(properties.task_due_date_1).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    // Slots 4 and 5 are still sent, but blank/null, so HubSpot clears any
    // stale values left over from prior weeks' digests.
    expect(properties.task_name_4).toBe('')
    expect(properties.task_description_4).toBe('')
    expect(properties.task_type_4).toBe('')
    expect(properties.task_due_date_4).toBe('')
    expect(properties.task_week_number_4).toBe(null)
    expect(properties.task_name_5).toBe('')
    expect(properties.task_description_5).toBe('')
    expect(properties.task_type_5).toBe('')
    expect(properties.task_due_date_5).toBe('')
    expect(properties.task_week_number_5).toBe(null)
  })

  it('sends event with all 5 task slots when 5 tasks exist', async () => {
    mockQueryRaw.mockResolvedValueOnce(
      [1, 2, 3, 4, 5].map((slot) =>
        makeDigestRow({
          slot,
          title: `T${slot}`,
          completed_count: 0,
          incomplete_count: 7,
        }),
      ),
    )

    await service.handleWeeklyTasksDigest({
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
    })

    const [, , properties] = (mockAnalytics.track as ReturnType<typeof vi.fn>)
      .mock.calls[0]

    expect(properties.task_name_1).toBe('T1')
    expect(properties.task_name_5).toBe('T5')
    expect(properties.plan_total_tasks).toBe(7)
  })

  it('tracks the correct event name and user id', async () => {
    mockQueryRaw.mockResolvedValueOnce([
      makeDigestRow({ user_id: 100, slot: 1 }),
      makeDigestRow({ user_id: 100, slot: 2 }),
      makeDigestRow({ user_id: 100, slot: 3 }),
    ])

    await service.handleWeeklyTasksDigest({
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
    })

    expect(mockAnalytics.track).toHaveBeenCalledWith(
      100,
      EVENTS.CampaignPlan.WeeklyTasksDigest,
      expect.any(Object),
    )
  })

  it('fires one event per campaign when multiple campaigns are eligible', async () => {
    mockQueryRaw.mockResolvedValueOnce([
      makeDigestRow({ campaign_id: 1, user_id: 100, slot: 1 }),
      makeDigestRow({ campaign_id: 1, user_id: 100, slot: 2 }),
      makeDigestRow({ campaign_id: 1, user_id: 100, slot: 3 }),
      makeDigestRow({ campaign_id: 2, user_id: 200, slot: 1 }),
      makeDigestRow({ campaign_id: 2, user_id: 200, slot: 2 }),
      makeDigestRow({ campaign_id: 2, user_id: 200, slot: 3 }),
    ])

    await service.handleWeeklyTasksDigest({
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
    })

    expect(mockAnalytics.track).toHaveBeenCalledTimes(2)
    const userIds = (mockAnalytics.track as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0])
      .sort()
    expect(userIds).toEqual([100, 200])
  })

  it('continues processing remaining campaigns when analytics fails for one', async () => {
    mockQueryRaw.mockResolvedValueOnce([
      makeDigestRow({ campaign_id: 1, user_id: 100, slot: 1 }),
      makeDigestRow({ campaign_id: 1, user_id: 100, slot: 2 }),
      makeDigestRow({ campaign_id: 1, user_id: 100, slot: 3 }),
      makeDigestRow({ campaign_id: 2, user_id: 200, slot: 1 }),
      makeDigestRow({ campaign_id: 2, user_id: 200, slot: 2 }),
      makeDigestRow({ campaign_id: 2, user_id: 200, slot: 3 }),
    ])
    ;(mockAnalytics.track as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('Segment down'))
      .mockResolvedValueOnce(undefined)

    await service.handleWeeklyTasksDigest({
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
    })

    expect(mockAnalytics.track).toHaveBeenCalledTimes(2)
  })
})
