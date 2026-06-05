import { ExperimentRunsService } from '@/agentExperiments/services/experimentRuns.service'
import { AnalyticsService } from '@/analytics/analytics.service'
import { CronLockService } from '@/cron/services/cronLock.service'
import { MeetingSchedule } from '@/generated/agent-job-contracts'
import { LlmService } from '@/llm/services/llm.service'
import { OrganizationsService } from '@/organizations/services/organizations.service'
import { parseIsoDateAsUTC } from '@/shared/util/date.util'
import { getUserFullName } from '@/users/util/users.util'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { BraintrustService } from '@/vendors/braintrust/braintrust.service'
import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import {
  ElectedOffice,
  ExperimentRun,
  ExperimentRunStatus,
  MeetingResourceLocationType,
  Prisma,
} from '../../generated/prisma'
import { addDays } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { chunk } from 'es-toolkit'
import ms from 'ms'
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { rrulestr } from 'rrule'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'

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

// Maximum prose length we persist for a discovered location hint. Mirrors the
// runbooks manifests so the DB row matches what the schema validator allows.
const DISCOVERED_LOCATION_MAX = 2000

const readStringField = (obj: unknown, key: string): string | null => {
  if (
    typeof obj !== 'object' ||
    obj === null ||
    Array.isArray(obj) ||
    !(key in obj)
  ) {
    return null
  }
  const value: unknown = Reflect.get(obj, key)
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, DISCOVERED_LOCATION_MAX)
}

const extractDiscoveredScheduleLocation = (schedule: unknown): string | null =>
  readStringField(schedule, 'discovered_schedule_location')

const extractDiscoveredAgendaLocation = (artifact: unknown): string | null => {
  if (
    typeof artifact !== 'object' ||
    artifact === null ||
    Array.isArray(artifact) ||
    !('run_metadata' in artifact)
  ) {
    return null
  }
  return readStringField(
    Reflect.get(artifact, 'run_metadata'),
    'discovered_agenda_location',
  )
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
  meetingTime?: string // HH:MM (optional — user-supplied agenda path leaves it to the agent)
  meetingTimezone?: string // IANA (optional — same reason)
}

@Injectable()
export class MeetingBriefingsService extends createPrismaBase(
  MODELS.MeetingBriefing,
) {
  constructor(
    private readonly s3: S3Service,
    private readonly organizations: OrganizationsService,
    private readonly experimentRuns: ExperimentRunsService,
    private readonly analytics: AnalyticsService,
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

  private async loadLocationHint(
    electedOfficeId: string,
    type: MeetingResourceLocationType,
  ): Promise<string | null> {
    const row = await this.client.meetingResourceLocation.findUnique({
      where: { electedOfficeId_type: { electedOfficeId, type } },
      select: { description: true },
    })
    return row?.description ?? null
  }

  private async dispatchSchedule(ctx: DispatchContext): Promise<void> {
    const hint = await this.loadLocationHint(
      ctx.electedOfficeId,
      MeetingResourceLocationType.SCHEDULE,
    )
    await this.experimentRuns.dispatchRun({
      type: SCHEDULE_EXPERIMENT_TYPE,
      organizationSlug: ctx.organizationSlug,
      clerkUserId: ctx.clerkUserId,
      params: {
        elected_office_id: ctx.electedOfficeId,
        state: ctx.state,
        office: ctx.positionName,
        ...(hint ? { known_schedule_location: hint } : {}),
      },
    })
  }

  private async dispatchBriefing(
    ctx: DispatchContext,
    meeting: TargetMeeting,
    options: {
      // URL-paste path: user gave us a URL to an agenda. Travels in params as
      // an ordinary string the agent reads + cites.
      agendaPacketUrl?: string
      // UPLOAD path: user uploaded a file. Travels in params under the
      // reserved `_input_files` envelope key; the dispatch handler strips it
      // out of params before agent validation/PARAMS_JSON and uses it to
      // tell the runner to pre-fetch via the broker into /workspace/input/.
      inputFiles?: Array<{ bucket: string; key: string; dest: string }>
    } = {},
  ): Promise<{ runId: string } | undefined> {
    const hint = await this.loadLocationHint(
      ctx.electedOfficeId,
      MeetingResourceLocationType.AGENDA,
    )
    const run = await this.experimentRuns.dispatchRun({
      type: BRIEFING_EXPERIMENT_TYPE,
      organizationSlug: ctx.organizationSlug,
      clerkUserId: ctx.clerkUserId,
      params: {
        officialName: ctx.officialName,
        state: ctx.state,
        positionName: ctx.positionName,
        meetingDate: meeting.meetingDate,
        ...(meeting.meetingTime ? { meetingTime: meeting.meetingTime } : {}),
        ...(meeting.meetingTimezone
          ? { meetingTimezone: meeting.meetingTimezone }
          : {}),
        ...(ctx.l2DistrictType ? { l2DistrictType: ctx.l2DistrictType } : {}),
        ...(ctx.l2DistrictName ? { l2DistrictName: ctx.l2DistrictName } : {}),
        ...(hint ? { knownAgendaLocation: hint } : {}),
        ...(options.agendaPacketUrl
          ? { agendaPacketUrl: options.agendaPacketUrl }
          : {}),
        ...(options.inputFiles && options.inputFiles.length > 0
          ? { _input_files: options.inputFiles }
          : {}),
      },
    })
    return run ? { runId: run.runId } : undefined
  }

  /**
   * Public entry point for user-supplied agenda runs. Bypasses the imminence
   * gate and the schedule lookup — the user is telling us "brief THIS meeting
   * with THIS agenda." We still resolve the dispatch context (officialName,
   * state, etc.) the normal way; the only PARAMS differences are
   * `agendaPacketUrl` or `_input_files` set and `meetingTime`/`meetingTimezone`
   * left to the agent to discover from the platform (we don't reliably know
   * them for arbitrary user-supplied dates).
   *
   * Caller supplies exactly one of `agendaPacketUrl` (URL-paste path; user's
   * own URL — never a presigned one) or `inputFiles` (UPLOAD path; runner
   * pre-fetches via the broker before the agent boots). Not validated here:
   * the caller is the upload service, which always sets exactly one.
   */
  async dispatchBriefingWithUserAgenda(args: {
    electedOfficeId: string
    meetingDate: string
    agendaPacketUrl?: string
    inputFiles?: Array<{ bucket: string; key: string; dest: string }>
  }): Promise<{ runId: string }> {
    const electedOffice = await this.client.electedOffice.findUnique({
      where: { id: args.electedOfficeId },
    })
    if (!electedOffice) {
      throw new NotFoundException(
        `electedOffice not found: ${args.electedOfficeId}`,
      )
    }
    const ctx = await this.resolveDispatchContext(electedOffice)
    if (!ctx) {
      throw new NotFoundException(
        `could not resolve dispatch context for electedOffice ${args.electedOfficeId}`,
      )
    }
    const result = await this.dispatchBriefing(
      ctx,
      { meetingDate: args.meetingDate },
      {
        ...(args.agendaPacketUrl
          ? { agendaPacketUrl: args.agendaPacketUrl }
          : {}),
        ...(args.inputFiles ? { inputFiles: args.inputFiles } : {}),
      },
    )
    if (!result) {
      throw new BadGatewayException(
        'dispatch queue not configured; briefing run was not enqueued',
      )
    }
    return result
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
    useImminenceGate = false,
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

    // A briefing needs a meetingDate from the schedule. With the imminence
    // gate on, match the daily cron exactly: skip if a future briefing already
    // covers the official, and only dispatch when the next meeting falls inside
    // the 5-day window. With the gate off (the UI "brief now" button) widen to
    // 60 days so an operator can pre-brief a meeting that's still weeks away.
    const now = new Date()
    if (useImminenceGate) {
      const futureBriefing = await this.model.findFirst({
        where: { electedOfficeId, meetingDate: { gte: now } },
        select: { id: true },
      })
      if (futureBriefing) return { dispatched: false }
    }

    const target = await this.resolveTargetMeeting(
      ctx.organizationSlug,
      ctx.electedOfficeId,
      now,
      useImminenceGate ? IMMINENCE_WINDOW_DAYS : 60,
    )
    if (!target) return { dispatched: false }

    // dispatchBriefing returns undefined when the run wasn't enqueued (queue
    // not configured); don't report success in that case.
    const result = await this.dispatchBriefing(ctx, target)
    return { dispatched: !!result }
  }

  async onExperimentRunCompleted(run: ExperimentRun): Promise<void> {
    if (run.status !== ExperimentRunStatus.COMPLETED) return

    if (run.experimentType === BRIEFING_EXPERIMENT_TYPE) {
      await this.handleBriefingCompletion(run)
      return
    }

    if (run.experimentType === SCHEDULE_EXPERIMENT_TYPE) {
      // Critical work first (cron chain). Hint persistence is a best-effort
      // optimization and must not gate the briefing dispatch — the queue
      // consumer swallows throws from this handler without retry.
      await this.maybeDispatchBriefingAfterSchedule(run)
      await this.persistScheduleLocationFromRun(run)
    }
  }

  private async handleBriefingCompletion(run: ExperimentRun): Promise<void> {
    const loaded = await this.loadBriefingArtifact(run)
    if (!loaded) return
    // Critical work first (the briefing row). Location persistence comes
    // after so a hint-upsert failure can't block the row write — the queue
    // consumer swallows throws from this handler without retry. Location
    // persists regardless of briefing_status (writeBriefingRowFromArtifact
    // early-returns on placeholder statuses), so placeholder runs still
    // capture the hint.
    await this.writeBriefingRowFromArtifact(
      run,
      loaded.electedOffice,
      loaded.artifact,
    )
    await this.persistAgendaLocationFromArtifact(
      run,
      loaded.electedOffice.id,
      loaded.artifact,
    )
  }

  private async upsertResourceLocation(args: {
    electedOfficeId: string
    type: MeetingResourceLocationType
    description: string
    experimentRunId: string
  }): Promise<void> {
    const { electedOfficeId, type, description, experimentRunId } = args
    await this.client.meetingResourceLocation.upsert({
      where: { electedOfficeId_type: { electedOfficeId, type } },
      create: { electedOfficeId, type, description, experimentRunId },
      update: { description, experimentRunId },
    })
  }

  private async persistScheduleLocationFromRun(
    run: ExperimentRun,
  ): Promise<void> {
    if (!run.artifactBucket || !run.artifactKey) return

    const raw = await this.s3.getFile(run.artifactBucket, run.artifactKey)
    if (!raw) return

    let schedule: unknown
    try {
      schedule = JSON.parse(raw)
    } catch {
      return
    }

    const description = extractDiscoveredScheduleLocation(schedule)
    if (!description) return

    const electedOfficeId = extractElectedOfficeId(run.params)
    if (!electedOfficeId) {
      this.logger.warn(
        { runId: run.runId },
        'schedule run completed without elected_office_id in params; cannot persist location hint',
      )
      return
    }

    await this.upsertResourceLocation({
      electedOfficeId,
      type: MeetingResourceLocationType.SCHEDULE,
      description,
      experimentRunId: run.runId,
    })
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

  private async loadBriefingArtifact(run: ExperimentRun): Promise<{
    artifact: PrismaJson.MeetingBriefingArtifact
    electedOffice: { id: string; userId: number }
  } | null> {
    if (!run.artifactBucket || !run.artifactKey) {
      this.logger.error(
        { runId: run.runId },
        'meeting_briefing completed without artifact pointers',
      )
      return null
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
      return null
    }

    const raw = await this.s3.getFile(run.artifactBucket, run.artifactKey)
    if (!raw) {
      this.logger.error(
        { runId: run.runId },
        'meeting_briefing artifact missing from S3',
      )
      return null
    }

    try {
      return { artifact: parseBriefingArtifact(raw), electedOffice }
    } catch {
      this.logger.error(
        { runId: run.runId },
        'meeting_briefing artifact is not valid JSON',
      )
      return null
    }
  }

  private async persistAgendaLocationFromArtifact(
    run: ExperimentRun,
    electedOfficeId: string,
    artifact: PrismaJson.MeetingBriefingArtifact,
  ): Promise<void> {
    const description = extractDiscoveredAgendaLocation(artifact)
    if (!description) return
    await this.upsertResourceLocation({
      electedOfficeId,
      type: MeetingResourceLocationType.AGENDA,
      description,
      experimentRunId: run.runId,
    })
  }

  // Resolve the (meetingTime, meetingTimezone) to persist. The platform path
  // requires a valid HH:MM time and a timezone and returns null (skip the row)
  // when either is malformed. The user-agenda path dispatches without those
  // PARAMS — the meeting often isn't on any platform for the agent to read a
  // time from (ad-hoc / small-jurisdiction meetings are the whole point of
  // letting a user supply the packet) — so it persists with empty values
  // rather than skipping. Blocking there would strand the user on a perpetual
  // "processing" pill for exactly the meetings this feature targets.
  private resolveMeetingTimeFields(
    artifact: PrismaJson.MeetingBriefingArtifact,
    userSuppliedAgenda: boolean,
    runId: string,
  ): { meetingTime: string; meetingTimezone: string } | null {
    const rawTime =
      typeof artifact.meeting_time === 'string' ? artifact.meeting_time : ''
    const timeValid = /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(rawTime)
    if (!timeValid && !userSuppliedAgenda) {
      this.logger.error(
        { runId, meetingTime: rawTime },
        'meeting_briefing artifact has invalid meeting_time',
      )
      return null
    }

    const rawTimezone =
      typeof artifact.meeting_timezone === 'string'
        ? artifact.meeting_timezone
        : ''
    if (!rawTimezone && !userSuppliedAgenda) {
      this.logger.error(
        { runId },
        'meeting_briefing artifact missing meeting_timezone',
      )
      return null
    }

    return {
      meetingTime: timeValid ? rawTime : '',
      meetingTimezone: rawTimezone,
    }
  }

  private async writeBriefingRowFromArtifact(
    run: ExperimentRun,
    electedOffice: { id: string; userId: number },
    artifact: PrismaJson.MeetingBriefingArtifact,
  ): Promise<void> {
    if (!run.artifactBucket || !run.artifactKey) return

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

    const resolved = this.resolveMeetingTimeFields(
      artifact,
      briefingStatus === 'agenda_provided_by_user',
      run.runId,
    )
    if (!resolved) return
    const { meetingTime, meetingTimezone } = resolved

    const electedOfficeId = electedOffice.id
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
      await this.analytics.track(
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
            models: ['deepseek-ai/DeepSeek-V4-Pro'],
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
