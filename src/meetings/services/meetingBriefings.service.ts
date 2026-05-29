import { Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import {
  ElectedOffice,
  ExperimentRun,
  ExperimentRunStatus,
  Prisma,
} from '@prisma/client'
import { rrulestr } from 'rrule'
import { formatInTimeZone } from 'date-fns-tz'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { OrganizationsService } from '@/organizations/services/organizations.service'
import { ExperimentRunsService } from '@/agentExperiments/services/experimentRuns.service'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { SegmentService } from '@/vendors/segment/segment.service'
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { LlmService } from '@/llm/services/llm.service'
import { BraintrustService } from '@/vendors/braintrust/braintrust.service'
import { parseIsoDateAsUTC } from '@/shared/util/date.util'
import { MeetingSchedule } from '@/generated/agent-job-contracts'
import { getUserFullName } from '@/users/util/users.util'
import { CronLockService } from '@/cron/services/cronLock.service'
import { chunk } from 'es-toolkit'
import ms from 'ms'

const parseBriefingArtifact = (
  raw: string,
): PrismaJson.MeetingBriefingArtifact =>
  // JSON.parse returns unknown — no way to infer parsed shape at compile time
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  JSON.parse(raw) as PrismaJson.MeetingBriefingArtifact
const parseSchedule = (raw: string): MeetingSchedule =>
  // JSON.parse returns unknown — no way to infer parsed shape at compile time
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  JSON.parse(raw) as MeetingSchedule

const SCHEDULE_EXPERIMENT_TYPE = 'meeting_schedule'
const BRIEFING_EXPERIMENT_TYPE = 'meeting_briefing'

// Identifies the daily-briefing cron in the cron_run lease table.
const DAILY_BRIEFINGS_CRON_JOB = 'dispatchDailyBriefings'

const isAutomationEnabled = () =>
  process.env.MEETINGS_AUTOMATION_ENABLED === 'true'

export type ManualDispatchKind = 'schedule' | 'briefing'

export type ProjectArgs = {
  schedule: MeetingSchedule
  from: Date
  to: Date
}

type DispatchContext = {
  electedOfficeId: string
  organizationSlug: string
  clerkUserId: string
  officialName: string
  state: string
  positionName: string
  l2DistrictType?: string
  l2DistrictName?: string
}

const CRON_CONFIG = {
  batchSize: 100,
  every: '20m' as const,
}

@Injectable()
export class MeetingBriefingsService extends createPrismaBase(
  MODELS.MeetingBriefing,
) {
  constructor(
    private readonly s3: S3Service,
    private readonly organizations: OrganizationsService,
    private readonly experimentRuns: ExperimentRunsService,
    private readonly segment: SegmentService,
    private readonly llm: LlmService,
    private readonly braintrust: BraintrustService,
    private readonly cronLock: CronLockService,
  ) {
    super()
  }

  async loadLatestScheduleForOrg(
    organizationSlug: string,
  ): Promise<MeetingSchedule | null> {
    const run = await this.client.experimentRun.findFirst({
      where: {
        organizationSlug,
        experimentType: SCHEDULE_EXPERIMENT_TYPE,
        status: ExperimentRunStatus.COMPLETED,
        artifactBucket: { not: null },
        artifactKey: { not: null },
      },
      orderBy: { createdAt: Prisma.SortOrder.desc },
    })
    if (!run || !run.artifactBucket || !run.artifactKey) return null

    const raw = await this.s3.getFile(run.artifactBucket, run.artifactKey)
    if (!raw) return null

    try {
      return parseSchedule(raw)
    } catch {
      this.logger.error(
        { organizationSlug, runId: run.runId },
        'meeting_schedule artifact is not valid JSON',
      )
      return null
    }
  }

  projectMeetingDates({ schedule, from, to }: ProjectArgs): string[] {
    if (schedule.status === 'not_found') return []

    try {
      const anchorDate = formatInTimeZone(from, schedule.timezone, 'yyyyMMdd')
      const anchorTime = schedule.time.replace(':', '') + '00'

      const rule = rrulestr(
        `DTSTART:${anchorDate}T${anchorTime}\nRRULE:${schedule.rrule}`,
      )

      return rule
        .between(from, to, true)
        .map((d) => formatInTimeZone(d, 'UTC', 'yyyy-MM-dd'))
    } catch {
      return []
    }
  }

  async onElectedOfficeCreated(electedOffice: ElectedOffice): Promise<void> {
    if (!isAutomationEnabled()) {
      this.logger.info(
        { electedOfficeId: electedOffice.id },
        'meetings automation disabled; skipping auto dispatch',
      )
      return
    }
    const ctx = await this.resolveDispatchContext(electedOffice)
    if (!ctx) return

    await Promise.all([this.dispatchSchedule(ctx), this.dispatchBriefing(ctx)])
  }

  private async dispatchSchedule(ctx: DispatchContext): Promise<void> {
    await this.experimentRuns.dispatchRun({
      type: SCHEDULE_EXPERIMENT_TYPE,
      organizationSlug: ctx.organizationSlug,
      clerkUserId: ctx.clerkUserId,
      params: {
        elected_office_id: ctx.electedOfficeId,
        state: ctx.state,
        office: ctx.positionName,
      },
    })
  }

  private async dispatchBriefing(ctx: DispatchContext): Promise<void> {
    await this.experimentRuns.dispatchRun({
      type: BRIEFING_EXPERIMENT_TYPE,
      organizationSlug: ctx.organizationSlug,
      clerkUserId: ctx.clerkUserId,
      params: {
        officialName: ctx.officialName,
        state: ctx.state,
        positionName: ctx.positionName,
        ...(ctx.l2DistrictType ? { l2DistrictType: ctx.l2DistrictType } : {}),
        ...(ctx.l2DistrictName ? { l2DistrictName: ctx.l2DistrictName } : {}),
      },
    })
  }

  async dispatchManual(
    electedOfficeId: string,
    kind: ManualDispatchKind,
  ): Promise<{ dispatched: boolean }> {
    const electedOffice = await this.client.electedOffice.findUnique({
      where: { id: electedOfficeId },
    })
    if (!electedOffice) return { dispatched: false }

    const ctx = await this.resolveDispatchContext(electedOffice)
    if (!ctx) return { dispatched: false }

    if (kind === 'schedule') {
      await this.dispatchSchedule(ctx)
    } else {
      await this.dispatchBriefing(ctx)
    }
    return { dispatched: true }
  }

  async onExperimentRunCompleted(run: ExperimentRun): Promise<void> {
    if (run.status !== ExperimentRunStatus.COMPLETED) return

    if (run.experimentType === BRIEFING_EXPERIMENT_TYPE) {
      await this.upsertBriefingRow(run)
    }
  }

  @Cron('0 7 * * *')
  async dispatchDailyBriefings(): Promise<void> {
    if (!isAutomationEnabled()) {
      this.logger.info(
        'meetings automation disabled; skipping daily briefing cron',
      )
      return
    }

    // Every ECS replica fires this @Cron, so without a guard each office would
    // be enqueued once per replica (2x in prod). Claim a once-per-day lease so
    // only the winning replica runs the long batched dispatch loop below.
    const claimed = await this.cronLock.tryClaimDailyRun(
      DAILY_BRIEFINGS_CRON_JOB,
    )
    if (!claimed) return

    const offices = await this.client.electedOffice.findMany({
      select: { id: true, organizationSlug: true, userId: true },
    })

    const now = new Date()

    const chunks = chunk(offices, CRON_CONFIG.batchSize)

    for (const [i, batch] of chunks.entries()) {
      for (const eo of batch) {
        await this.dispatchBriefingIfNeeded(eo, now).catch((err: unknown) =>
          this.logger.error(
            { err, electedOfficeId: eo.id },
            'dispatchBriefingIfNeeded failed, continuing',
          ),
        )
      }
      if (i < chunks.length - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, ms(CRON_CONFIG.every)),
        )
      }
    }
  }

  private async dispatchBriefingIfNeeded(
    eo: { id: string; organizationSlug: string; userId: number },
    now: Date,
  ): Promise<void> {
    const futureBriefing = await this.model.findFirst({
      where: { electedOfficeId: eo.id, meetingDate: { gte: now } },
      select: { id: true },
    })
    if (futureBriefing) return

    const electedOffice = await this.client.electedOffice.findUnique({
      where: { id: eo.id },
    })
    if (!electedOffice) return

    const ctx = await this.resolveDispatchContext(electedOffice)
    if (!ctx) return

    await this.dispatchBriefing(ctx)
  }

  private async resolveDispatchContext(
    electedOffice: ElectedOffice,
  ): Promise<DispatchContext | null> {
    const [user, organization] = await Promise.all([
      this.client.user.findUnique({
        where: { id: electedOffice.userId },
      }),
      this.client.organization.findUnique({
        where: { slug: electedOffice.organizationSlug },
      }),
    ])

    if (!user?.clerkId) {
      this.logger.warn(
        { electedOfficeId: electedOffice.id },
        'skipping dispatch: user has no clerkId',
      )
      return null
    }

    const officialName = getUserFullName(user)
    const serveCtx = organization
      ? await this.organizations.resolveServeContext(organization)
      : null

    if (!serveCtx || !officialName) {
      this.logger.warn(
        {
          electedOfficeId: electedOffice.id,
          missing: {
            state: !serveCtx?.state,
            positionName: !serveCtx?.positionName,
            officialName: !officialName,
          },
        },
        'skipping dispatch: missing required context',
      )
      return null
    }

    return {
      electedOfficeId: electedOffice.id,
      organizationSlug: electedOffice.organizationSlug,
      clerkUserId: user.clerkId,
      officialName,
      state: serveCtx.state,
      positionName: serveCtx.positionName,
      l2DistrictType: serveCtx.l2DistrictType,
      l2DistrictName: serveCtx.l2DistrictName,
    }
  }

  private async upsertBriefingRow(run: ExperimentRun): Promise<void> {
    if (!run.artifactBucket || !run.artifactKey) {
      this.logger.error(
        { runId: run.runId },
        'meeting_briefing completed without artifact pointers',
      )
      return
    }

    const electedOffice = await this.client.electedOffice.findUnique({
      where: { organizationSlug: run.organizationSlug },
      select: { id: true, userId: true },
    })
    if (!electedOffice) {
      this.logger.error(
        { runId: run.runId, organizationSlug: run.organizationSlug },
        'meeting_briefing completed but no ElectedOffice for the org',
      )
      return
    }
    const electedOfficeId = electedOffice.id

    const raw = await this.s3.getFile(run.artifactBucket, run.artifactKey)
    if (!raw) {
      this.logger.error(
        { runId: run.runId },
        'meeting_briefing artifact missing from S3',
      )
      return
    }

    let artifact: PrismaJson.MeetingBriefingArtifact
    try {
      artifact = parseBriefingArtifact(raw)
    } catch {
      this.logger.error(
        { runId: run.runId },
        'meeting_briefing artifact is not valid JSON',
      )
      return
    }

    const briefingStatus = artifact.briefing_status
    if (briefingStatus === undefined) {
      this.logger.error(
        { runId: run.runId },
        'meeting_briefing artifact missing briefing_status field',
      )
      return
    }
    if (briefingStatus === 'error') {
      this.logger.error(
        { runId: run.runId, briefingStatus },
        'meeting_briefing artifact reports an unrecoverable error; skipping row write',
      )
      return
    }
    if (
      briefingStatus !== 'briefing_ready' &&
      briefingStatus !== 'agenda_provided_by_user'
    ) {
      this.logger.info(
        { runId: run.runId, briefingStatus },
        'meeting_briefing produced a placeholder; skipping row write so the next cron run retries',
      )
      return
    }

    const dateString =
      typeof artifact.meeting_date === 'string' ? artifact.meeting_date : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      this.logger.error(
        { runId: run.runId, dateString },
        'meeting_briefing artifact has invalid meeting_date',
      )
      return
    }

    const meetingTime =
      typeof artifact.meeting_time === 'string' ? artifact.meeting_time : ''
    if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(meetingTime)) {
      this.logger.error(
        { runId: run.runId, meetingTime },
        'meeting_briefing artifact has invalid meeting_time',
      )
      return
    }

    const meetingTimezone =
      typeof artifact.meeting_timezone === 'string'
        ? artifact.meeting_timezone
        : ''
    if (!meetingTimezone) {
      this.logger.error(
        { runId: run.runId },
        'meeting_briefing artifact missing meeting_timezone',
      )
      return
    }

    await this.model.upsert({
      where: {
        electedOfficeId_meetingDate: {
          electedOfficeId,
          meetingDate: parseIsoDateAsUTC(dateString),
        },
      },
      create: {
        electedOfficeId,
        meetingDate: parseIsoDateAsUTC(dateString),
        meetingTime,
        meetingTimezone,
        experimentRunId: run.runId,
        artifactBucket: run.artifactBucket,
        artifactKey: run.artifactKey,
        artifact,
      },
      update: {
        meetingTime,
        meetingTimezone,
        experimentRunId: run.runId,
        artifactBucket: run.artifactBucket,
        artifactKey: run.artifactKey,
        artifact,
      },
    })

    await this.trackAgendaPickedUp({
      userId: electedOffice.userId,
      artifact,
      dateString,
      meetingTime,
      meetingTimezone,
    })
  }

  private async trackAgendaPickedUp({
    userId,
    artifact,
    dateString,
    meetingTime,
    meetingTimezone,
  }: {
    userId: number
    artifact: PrismaJson.MeetingBriefingArtifact
    dateString: string
    meetingTime: string
    meetingTimezone: string
  }): Promise<void> {
    const meetingType = artifact.meeting_name ?? ''
    const topItems = readTopAgendaItems(artifact, 3)
    const execSummary = await this.generateAgendaHook({
      userId,
      meetingType,
      meetingDate: dateString,
      topItems,
      leadInFallback: readLeadIn(artifact),
    })

    try {
      await this.segment.trackEvent(
        userId,
        'Briefing Assistant - Agenda Created',
        {
          agendaId: dateString,
          meetingDate: dateString,
          meetingTime,
          meetingTimezone,
          meetingPlace: artifact.location ?? '',
          meetingType,
          execSummary,
          ...flattenTopAgendaItems(topItems),
        },
      )
    } catch (err) {
      this.logger.error(
        { err, userId },
        '[SEGMENT] Failed to track Briefing Assistant - Agenda Created',
      )
    }
  }

  private async generateAgendaHook({
    userId,
    meetingType,
    meetingDate,
    topItems,
    leadInFallback,
  }: {
    userId: number
    meetingType: string
    meetingDate: string
    topItems: { title: string; overview: string }[]
    leadInFallback: string
  }): Promise<string> {
    if (topItems.length === 0) return leadInFallback

    const itemsBlock = topItems
      .map(
        (it, i) =>
          `${i + 1}. ${it.title}${it.overview ? `\n   ${it.overview}` : ''}`,
      )
      .join('\n')

    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content:
          'You write short, attention-grabbing previews that get a sitting elected official to open their meeting briefing. Lead with what is at stake. Be concrete, never breathless. No greetings, no meta ("this briefing covers..."), no hedging. Maximum 2 sentences, ideally 1. Second person ("you"). Plain language. End with a period.',
      },
      {
        role: 'user',
        content: `Meeting: ${meetingType || 'Upcoming meeting'} on ${meetingDate}\n\nTop 3 items (in order of importance):\n${itemsBlock}\n\nWrite a 1-2 sentence hook that previews what this meeting is really about, based on these three items only. Focus on the votes or decisions, not procedure.`,
      },
    ]

    try {
      const result = await this.braintrust.traced(
        'agenda-picked-up-hook',
        () =>
          this.llm.chatCompletion({
            messages,
            models: ['claude-haiku-4-5', 'claude-sonnet-4-6'],
            temperature: 0.4,
            maxTokens: 200,
            userId: String(userId),
          }),
        {
          input: { meetingType, meetingDate, topItems },
          metadata: { userId, feature: 'agenda_picked_up' },
        },
      )
      const hook = result.content.trim()
      return hook || leadInFallback
    } catch (err) {
      this.logger.error(
        { err, userId, meetingDate },
        'Failed to generate Briefing Assistant - Agenda Created hook; falling back to lead_in',
      )
      return leadInFallback
    }
  }
}

const isRecord = (
  value: Prisma.JsonValue | undefined,
): value is { [key: string]: Prisma.JsonValue } =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readLeadIn = (artifact: PrismaJson.MeetingBriefingArtifact): string => {
  const es = artifact['executive_summary']
  if (!isRecord(es)) return ''
  const leadIn = es['lead_in']
  return typeof leadIn === 'string' ? leadIn : ''
}

const flattenTopAgendaItems = (
  items: { title: string; overview: string }[],
): Record<string, string> => {
  const flat: Record<string, string> = {}
  items.forEach((item, idx) => {
    const n = idx + 1
    flat[`agendaItem${n}Name`] = item.title
    flat[`agendaItem${n}Description`] = item.overview
  })
  return flat
}

const readTopAgendaItems = (
  artifact: PrismaJson.MeetingBriefingArtifact,
  limit: number,
): { title: string; overview: string }[] => {
  const items = artifact['items']
  if (!Array.isArray(items)) return []
  const summaryItems = readExecutiveSummaryItems(artifact)
  return items
    .slice(0, limit)
    .map((item) => {
      if (!isRecord(item)) return { title: '', overview: '' }
      const title = typeof item['title'] === 'string' ? item['title'] : ''
      const itemId = typeof item['id'] === 'string' ? item['id'] : ''
      const overview = itemId ? (summaryItems.get(itemId) ?? '') : ''
      return { title, overview }
    })
    .filter((it) => it.title.length > 0)
}

const readExecutiveSummaryItems = (
  artifact: PrismaJson.MeetingBriefingArtifact,
): Map<string, string> => {
  const map = new Map<string, string>()
  const es = artifact['executive_summary']
  if (!isRecord(es)) return map
  const items = es['items']
  if (!Array.isArray(items)) return map
  for (const item of items) {
    if (!isRecord(item)) continue
    const itemId = item['item_id']
    const overview = item['overview']
    if (typeof itemId === 'string' && typeof overview === 'string') {
      map.set(itemId, overview)
    }
  }
  return map
}
