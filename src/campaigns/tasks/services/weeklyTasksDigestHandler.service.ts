import { Injectable } from '@nestjs/common'
import { CampaignTaskType, Prisma } from '@prisma/client'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { toDateOnlyString } from 'src/shared/util/date.util'
import { EVENTS } from 'src/vendors/segment/segment.types'
import { WeeklyTasksDigestMessage } from 'src/queue/queue.types'

const OUTREACH_FLOW_TYPES: CampaignTaskType[] = [
  CampaignTaskType.text,
  CampaignTaskType.robocall,
  CampaignTaskType.doorKnocking,
  CampaignTaskType.phoneBanking,
]
const MAX_TASKS = 5
const MIN_TASKS = 3

interface DigestRow {
  campaign_id: number
  user_id: number
  completed_count: number
  incomplete_count: number
  slot: number
  title: string
  description: string
  flow_type: CampaignTaskType | null
  date: Date
  week: number
}

interface TopTaskRow {
  title: string
  description: string
  flow_type: CampaignTaskType | null
  date: Date
  week: number
}

interface WeeklyDigestProperties {
  plan_tasks_completed: number
  plan_total_tasks: number
  task_name_1: string
  task_description_1: string
  task_type_1: string
  task_due_date_1: string
  task_week_number_1: number | null
  task_name_2: string
  task_description_2: string
  task_type_2: string
  task_due_date_2: string
  task_week_number_2: number | null
  task_name_3: string
  task_description_3: string
  task_type_3: string
  task_due_date_3: string
  task_week_number_3: number | null
  task_name_4: string
  task_description_4: string
  task_type_4: string
  task_due_date_4: string
  task_week_number_4: number | null
  task_name_5: string
  task_description_5: string
  task_type_5: string
  task_due_date_5: string
  task_week_number_5: number | null
}

type TaskSlotProperties = Pick<
  WeeklyDigestProperties,
  | 'task_name_1'
  | 'task_description_1'
  | 'task_type_1'
  | 'task_due_date_1'
  | 'task_week_number_1'
  | 'task_name_2'
  | 'task_description_2'
  | 'task_type_2'
  | 'task_due_date_2'
  | 'task_week_number_2'
  | 'task_name_3'
  | 'task_description_3'
  | 'task_type_3'
  | 'task_due_date_3'
  | 'task_week_number_3'
  | 'task_name_4'
  | 'task_description_4'
  | 'task_type_4'
  | 'task_due_date_4'
  | 'task_week_number_4'
  | 'task_name_5'
  | 'task_description_5'
  | 'task_type_5'
  | 'task_due_date_5'
  | 'task_week_number_5'
>

// Always emits all 5 task slots. Empty slots send blank/null values so HubSpot
// clears stale data from the previous week's digest.
function buildTaskProperties(tasks: TopTaskRow[]): TaskSlotProperties {
  const [t1, t2, t3, t4, t5] = tasks
  return {
    task_name_1: t1?.title ?? '',
    task_description_1: t1?.description ?? '',
    task_type_1: t1?.flow_type ?? '',
    task_due_date_1: toDateOnlyString(t1?.date) ?? '',
    task_week_number_1: t1?.week ?? null,
    task_name_2: t2?.title ?? '',
    task_description_2: t2?.description ?? '',
    task_type_2: t2?.flow_type ?? '',
    task_due_date_2: toDateOnlyString(t2?.date) ?? '',
    task_week_number_2: t2?.week ?? null,
    task_name_3: t3?.title ?? '',
    task_description_3: t3?.description ?? '',
    task_type_3: t3?.flow_type ?? '',
    task_due_date_3: toDateOnlyString(t3?.date) ?? '',
    task_week_number_3: t3?.week ?? null,
    task_name_4: t4?.title ?? '',
    task_description_4: t4?.description ?? '',
    task_type_4: t4?.flow_type ?? '',
    task_due_date_4: toDateOnlyString(t4?.date) ?? '',
    task_week_number_4: t4?.week ?? null,
    task_name_5: t5?.title ?? '',
    task_description_5: t5?.description ?? '',
    task_type_5: t5?.flow_type ?? '',
    task_due_date_5: toDateOnlyString(t5?.date) ?? '',
    task_week_number_5: t5?.week ?? null,
  }
}

interface CampaignDigestGroup {
  userId: number
  completedCount: number
  incompleteCount: number
  tasks: TopTaskRow[]
}

function groupByCampaign(rows: DigestRow[]): Map<number, CampaignDigestGroup> {
  const groups = new Map<number, CampaignDigestGroup>()
  for (const row of rows) {
    let group = groups.get(row.campaign_id)
    if (!group) {
      group = {
        userId: row.user_id,
        completedCount: row.completed_count,
        incompleteCount: row.incomplete_count,
        tasks: [],
      }
      groups.set(row.campaign_id, group)
    }
    group.tasks.push({
      title: row.title,
      description: row.description,
      flow_type: row.flow_type,
      date: row.date,
      week: row.week,
    })
  }
  return groups
}

@Injectable()
export class WeeklyTasksDigestHandlerService extends createPrismaBase(
  MODELS.CampaignTask,
) {
  constructor(private readonly analytics: AnalyticsService) {
    super()
  }

  async handleWeeklyTasksDigest(data: WeeklyTasksDigestMessage) {
    const windowStart = new Date(data.windowStart)
    const windowEnd = new Date(data.windowEnd)

    this.logger.info(
      { windowStart, windowEnd },
      'Processing weekly tasks digest',
    )

    // Single query: for every campaign with a future election date and at
    // least MIN_TASKS incomplete tasks in the window, return the top
    // MAX_TASKS incomplete tasks (outreach types prioritized, then by date).
    // Each row denormalizes the campaign's counts so we can group in JS.
    const rows = await this.client.$queryRaw<DigestRow[]>`
      WITH eligible AS (
        SELECT
          c.id,
          c.user_id,
          COUNT(*) FILTER (WHERE t.completed = true)::int  AS completed_count,
          COUNT(*) FILTER (WHERE t.completed = false)::int AS incomplete_count
        FROM campaign c
        JOIN campaign_task t ON t.campaign_id = c.id
        WHERE c.details->>'electionDate' ~ '^\\d{4}-\\d{2}-\\d{2}'
          AND (c.details->>'electionDate')::date > NOW()::date
          AND t.date >= ${windowStart}
          AND t.date < ${windowEnd}
        GROUP BY c.id, c.user_id
        HAVING COUNT(*) FILTER (WHERE t.completed = false) >= ${MIN_TASKS}
      ),
      ranked_tasks AS (
        SELECT
          t.campaign_id,
          t.title,
          t.description,
          t.flow_type,
          t.date,
          t.week,
          ROW_NUMBER() OVER (
            PARTITION BY t.campaign_id
            ORDER BY
              CASE WHEN t.flow_type::text IN (${Prisma.join(OUTREACH_FLOW_TYPES)})
                THEN 0 ELSE 1 END,
              t.date ASC
          ) AS slot
        FROM campaign_task t
        JOIN eligible e ON e.id = t.campaign_id
        WHERE t.completed = false
          AND t.date >= ${windowStart}
          AND t.date < ${windowEnd}
      )
      SELECT
        e.id           AS campaign_id,
        e.user_id,
        e.completed_count,
        e.incomplete_count,
        rt.slot::int   AS slot,
        rt.title,
        rt.description,
        rt.flow_type,
        rt.date,
        rt.week
      FROM eligible e
      JOIN ranked_tasks rt ON rt.campaign_id = e.id
      WHERE rt.slot <= ${MAX_TASKS}
      ORDER BY e.id, rt.slot
    `

    const campaigns = groupByCampaign(rows)

    let sent = 0
    let failed = 0

    for (const [campaignId, group] of campaigns) {
      try {
        const properties: WeeklyDigestProperties = {
          plan_tasks_completed: group.completedCount,
          plan_total_tasks: group.completedCount + group.incompleteCount,
          ...buildTaskProperties(group.tasks),
        }

        await this.analytics.track(
          group.userId,
          EVENTS.CampaignPlan.WeeklyTasksDigest,
          // The spread widens our strict WeeklyDigestProperties type to match
          // analytics.track's `Record<string, unknown>` signature. See WEB-4530
          // for the TODO to make the track signature generic.
          { ...properties },
        )

        this.logger.info(
          {
            campaignId,
            userId: group.userId,
            taskCount: group.tasks.length,
          },
          'Sent weekly tasks digest event',
        )
        sent++
      } catch (error) {
        this.logger.error(
          { campaignId, error },
          'Failed to process weekly digest for campaign',
        )
        failed++
      }
    }

    this.logger.info(
      { sent, failed, eligible: campaigns.size },
      'Weekly tasks digest complete',
    )
  }
}
