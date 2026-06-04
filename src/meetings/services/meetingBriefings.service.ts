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
import { addDays } from 'date-fns'
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

/**
 * Extract the `elected_office_id` field from an ExperimentRun's params
 * JSONB column without an unsafe cast. Returns null if the params is
 * not an object, the key is missing, or the value isn't a string.
 */
const extractElectedOfficeId = (params: unknown): string | null => {
  if (
    typeof params !== 'object' ||
    params === null ||
    Array.isArray(params) ||
    !('elected_office_id' in params)
  ) {
    return null
  }
  const value: unknown = params.elected_office_id
  return typeof value === 'string' ? value : null
}

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

// Briefings are dispatched only when the official's next scheduled meeting
// falls inside this window. Outside the window we skip — the agent's
// run would either bail to a placeholder (no packet published yet) or
// repeat work we'll redo when the meeting gets closer.
const IMMINENCE_WINDOW_DAYS = 5

type TargetMeeting = {
  meetingDate: string // YYYY-MM-DD
  meetingTime: string // HH:MM
  meetingTimezone: string // IANA
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

    // The elected-office create returns the existing row on retry / concurrent
    // race and re-invokes this hook. dispatchRun is not idempotent, so skip
    // when an active or successful schedule run already exists — otherwise a
    // retry spawns a duplicate live run and SQS message. A FAILED-only run is
    // not blocking: the first attempt did not succeed and nothing else
    // re-dispatches it (sweepStaleRuns only marks stale runs FAILED).
    const existingScheduleRun = await this.client.experimentRun.findFirst({
      where: {
        organizationSlug: electedOffice.organizationSlug,
        experimentType: SCHEDULE_EXPERIMENT_TYPE,
        status: {
          in: [
            ExperimentRunStatus.RUNNING,
            ExperimentRunStatus.AWAITING_RESUME,
            ExperimentRunStatus.COMPLETED,
          ],
        },
      },
    })
    if (existingScheduleRun) {
      this.logger.info(
        { electedOfficeId: electedOffice.id },
        'schedule run already exists for org; skipping re-dispatch',
      )
      return
    }

    const ctx = await this.resolveDispatchContext(electedOffice)
    if (!ctx) return

    // Only the schedule fires here. When the schedule run completes,
    // `onExperimentRunCompleted` checks the imminence gate and dispatches
    // the briefing if a meeting falls inside the window. This guarantees
    // we never run a briefing without a fresh schedule.
    await this.dispatchSchedule(ctx)
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

  private async dispatchBriefing(
    ctx: DispatchContext,
    meeting: TargetMeeting,
  ): Promise<void> {
    await this.experimentRuns.dispatchRun({
      type: BRIEFING_EXPERIMENT_TYPE,
      organizationSlug: ctx.organizationSlug,
      clerkUserId: ctx.clerkUserId,
      params: {
        officialName: ctx.officialName,
        state: ctx.state,
        positionName: ctx.positionName,
        meetingDate: meeting.meetingDate,
        meetingTime: meeting.meetingTime,
        meetingTimezone: meeting.meetingTimezone,
        ...(ctx.l2DistrictType ? { l2DistrictType: ctx.l2DistrictType } : {}),
        ...(ctx.l2DistrictName ? { l2DistrictName: ctx.l2DistrictName } : {}),
      },
    })
  }

  /**
   * Look up the official's latest meeting_schedule, project the next
   * meeting from its RRULE, and return the target meeting payload — or
   * null if no schedule exists, the schedule was not_found, or no
   * meeting falls inside the window.
   *
   * Callers pass `windowDays` to bound how far out to project. The cron
   * uses IMMINENCE_WINDOW_DAYS; manual dispatches use a wider window
   * (e.g. 60) so a user clicking "brief now" can override the gate.
   */
  private async resolveTargetMeeting(
    organizationSlug: string,
    electedOfficeId: string,
    now: Date,
    windowDays: number,
  ): Promise<TargetMeeting | null> {
    const schedule = await this.loadLatestScheduleForOrg(organizationSlug)
    if (!schedule) {
      this.logger.info(
        { electedOfficeId },
        'skipping briefing: no meeting_schedule available for org',
      )
      return null
    }
    if (schedule.status === 'not_found') {
      this.logger.info(
        { electedOfficeId },
        'skipping briefing: meeting_schedule is not_found',
      )
      return null
    }
    const windowEnd = addDays(now, windowDays)
    const upcoming = this.projectMeetingDates({
      schedule,
      from: now,
      to: windowEnd,
    })
    if (upcoming.length === 0) {
      this.logger.info(
        { electedOfficeId, windowDays },
        'skipping briefing: no projected meeting inside window',
      )
      return null
    }
    return {
      meetingDate: upcoming[0],
      meetingTime: schedule.time,
      meetingTimezone: schedule.timezone,
    }
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
      return { dispatched: true }
    }

    // Manual briefing dispatch bypasses the 5-day imminence gate but still
    // needs a meetingDate from the schedule. Project up to 60 days out so
    // an operator can pre-brief a meeting that's still a few weeks away.
    const target = await this.resolveTargetMeeting(
      ctx.organizationSlug,
      ctx.electedOfficeId,
      new Date(),
      60,
    )
    if (!target) return { dispatched: false }

    await this.dispatchBriefing(ctx, target)
    return { dispatched: true }
  }

  async onExperimentRunCompleted(run: ExperimentRun): Promise<void> {
    if (run.status !== ExperimentRunStatus.COMPLETED) return

    if (run.experimentType === BRIEFING_EXPERIMENT_TYPE) {
      await this.upsertBriefingRow(run)
      return
    }

    if (run.experimentType === SCHEDULE_EXPERIMENT_TYPE) {
      await this.maybeDispatchBriefingAfterSchedule(run)
    }
  }

  /**
   * When a meeting_schedule run completes, check whether that office now
   * qualifies for a meeting_briefing dispatch (imminence gate + coverage
   * dedupe). This is the path that fires the first briefing for a newly
   * created elected office: onElectedOfficeCreated dispatches only the
   * schedule; this hook dispatches the briefing once the schedule lands.
   */
  private async maybeDispatchBriefingAfterSchedule(
    run: ExperimentRun,
  ): Promise<void> {
    if (!isAutomationEnabled()) return

    // The schedule run's params include `elected_office_id` (snake_case);
    // see dispatchSchedule(). Narrow Prisma's JsonValue to a string field.
    const electedOfficeId = extractElectedOfficeId(run.params)
    if (!electedOfficeId) {
      this.logger.warn(
        { runId: run.runId },
        'schedule run completed without elected_office_id in params; cannot chain to briefing',
      )
      return
    }

    const eo = await this.client.electedOffice.findUnique({
      where: { id: electedOfficeId },
      select: { id: true, organizationSlug: true, userId: true },
    })
    if (!eo) return

    await this.dispatchBriefingIfNeeded(eo, new Date()).catch(
      (err: unknown) => {
        this.logger.error(
          { err, electedOfficeId, scheduleRunId: run.runId },
          'dispatchBriefingIfNeeded failed after schedule completion',
        )
      },
    )
  }

  @Cron('0 7 * * *')
  async dispatchDailyBriefings(): Promise<void> {
    if (!isAutomationEnabled()) {
      this.logger.info(
        'meetings automation disabled; skipping daily briefing cron',
      )
      return
    }

    // Pin a single timestamp for the whole run so the lease claim and its
    // completion resolve to the same UTC run-date even if the long loop below
    // crosses midnight.
    const now = new Date()

    // Every ECS replica fires this @Cron, so without a guard each office would
    // be enqueued once per replica (2x in prod). Claim a once-per-day lease so
    // only the winning replica runs the long batched dispatch loop below.
    const claimed = await this.cronLock.tryClaimDailyRun(
      DAILY_BRIEFINGS_CRON_JOB,
      now,
    )
    if (!claimed) return

    const offices = await this.client.electedOffice.findMany({
      select: { id: true, organizationSlug: true, userId: true },
    })

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

    // Mark the claim complete so a crashed-run takeover (see CronLockService)
    // is only triggered when the loop did not finish.
    await this.cronLock.markCompleted(DAILY_BRIEFINGS_CRON_JOB, now)
  }

  private async dispatchBriefingIfNeeded(
    eo: { id: string; organizationSlug: string; userId: number },
    now: Date,
  ): Promise<void> {
    // Coverage dedupe: skip if a briefing already covers an upcoming meeting.
    const futureBriefing = await this.model.findFirst({
      where: { electedOfficeId: eo.id, meetingDate: { gte: now } },
      select: { id: true },
    })
    if (futureBriefing) return

    // Imminence gate: only dispatch when the schedule shows a meeting
    // within IMMINENCE_WINDOW_DAYS. No schedule → no briefing.
    const target = await this.resolveTargetMeeting(
      eo.organizationSlug,
      eo.id,
      now,
      IMMINENCE_WINDOW_DAYS,
    )
    if (!target) return

    const electedOffice = await this.client.electedOffice.findUnique({
      where: { id: eo.id },
    })
    if (!electedOffice) return

    const ctx = await this.resolveDispatchContext(electedOffice)
    if (!ctx) return

    await this.dispatchBriefing(ctx, target)
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
