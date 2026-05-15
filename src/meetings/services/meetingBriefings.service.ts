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
import { ElectionsService } from '@/elections/services/elections.service'
import { ExperimentRunsService } from '@/agentExperiments/services/experimentRuns.service'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { parseIsoDateAsUTC } from '@/shared/util/date.util'
import { Briefing, MeetingSchedule } from '@/generated/agent-job-contracts'

// JSON.parse returns unknown — no way to infer parsed shape at compile time
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
const parseBriefing = (raw: string): Briefing => JSON.parse(raw) as Briefing
const parseSchedule = (raw: string): MeetingSchedule =>
  // JSON.parse returns unknown — no way to infer parsed shape at compile time
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  JSON.parse(raw) as MeetingSchedule

const SCHEDULE_EXPERIMENT_TYPE = 'meeting_schedule'
const BRIEFING_EXPERIMENT_TYPE = 'meeting_briefing'

export type ProjectArgs = {
  schedule: MeetingSchedule
  from: Date
  to: Date
}

type DispatchContext = {
  electedOfficeId: string
  organizationSlug: string
  clerkUserId: string
  city: string
  state: string
  office: string
}

const readStringField = (json: unknown, key: string): string => {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    return ''
  }
  // narrowing a JSON object — runtime guard above guarantees shape
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const value = (json as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : ''
}

@Injectable()
export class MeetingBriefingsService extends createPrismaBase(
  MODELS.MeetingBriefing,
) {
  constructor(
    private readonly s3: S3Service,
    private readonly elections: ElectionsService,
    private readonly experimentRuns: ExperimentRunsService,
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
    const ctx = await this.resolveDispatchContext(electedOffice)
    if (!ctx) return

    await this.experimentRuns.dispatchRun({
      type: SCHEDULE_EXPERIMENT_TYPE,
      organizationSlug: ctx.organizationSlug,
      clerkUserId: ctx.clerkUserId,
      params: {
        elected_office_id: ctx.electedOfficeId,
        city: ctx.city,
        state: ctx.state,
        office: ctx.office,
      },
    })
  }

  async onExperimentRunCompleted(run: ExperimentRun): Promise<void> {
    if (run.status !== ExperimentRunStatus.COMPLETED) return

    if (run.experimentType === SCHEDULE_EXPERIMENT_TYPE) {
      await this.dispatchFirstBriefingForOrg(run.organizationSlug)
      return
    }

    if (run.experimentType === BRIEFING_EXPERIMENT_TYPE) {
      await this.upsertBriefingRow(run)
    }
  }

  @Cron('0 7 * * *')
  async dispatchDailyBriefings(): Promise<void> {
    const offices = await this.client.electedOffice.findMany({
      select: { id: true, organizationSlug: true, userId: true },
    })

    const now = new Date()

    for (const eo of offices) {
      await this.dispatchBriefingIfNeeded(eo, now).catch((err: unknown) =>
        this.logger.error(
          { err, electedOfficeId: eo.id },
          'dispatchBriefingIfNeeded failed, continuing',
        ),
      )
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

    await this.experimentRuns.dispatchRun({
      type: BRIEFING_EXPERIMENT_TYPE,
      organizationSlug: ctx.organizationSlug,
      clerkUserId: ctx.clerkUserId,
      params: {
        elected_office_id: ctx.electedOfficeId,
        city: ctx.city,
        state: ctx.state,
        office: ctx.office,
      },
    })
  }

  private async dispatchFirstBriefingForOrg(
    organizationSlug: string,
  ): Promise<void> {
    const eo = await this.client.electedOffice.findFirst({
      where: { organizationSlug },
    })
    if (!eo) return

    const ctx = await this.resolveDispatchContext(eo)
    if (!ctx) return

    await this.experimentRuns.dispatchRun({
      type: BRIEFING_EXPERIMENT_TYPE,
      organizationSlug: ctx.organizationSlug,
      clerkUserId: ctx.clerkUserId,
      params: {
        elected_office_id: ctx.electedOfficeId,
        city: ctx.city,
        state: ctx.state,
        office: ctx.office,
      },
    })
  }

  private async resolveDispatchContext(
    electedOffice: ElectedOffice,
  ): Promise<DispatchContext | null> {
    const [user, organization, campaign] = await Promise.all([
      this.client.user.findUnique({
        where: { id: electedOffice.userId },
        select: { clerkId: true },
      }),
      this.client.organization.findUnique({
        where: { slug: electedOffice.organizationSlug },
        select: { positionId: true, customPositionName: true },
      }),
      electedOffice.campaignId
        ? this.client.campaign.findUnique({
            where: { id: electedOffice.campaignId },
            select: { details: true },
          })
        : Promise.resolve(null),
    ])

    if (!user?.clerkId) {
      this.logger.warn(
        { electedOfficeId: electedOffice.id },
        'skipping dispatch: user has no clerkId',
      )
      return null
    }

    const position = organization?.positionId
      ? await this.elections.getPositionById(organization.positionId)
      : null
    const state = position?.state ?? ''
    const office = organization?.customPositionName ?? position?.name ?? ''
    const city = readStringField(campaign?.details ?? null, 'city')

    if (!city || !state || !office) {
      this.logger.warn(
        {
          electedOfficeId: electedOffice.id,
          missing: { city: !city, state: !state, office: !office },
        },
        'skipping dispatch: missing required context',
      )
      return null
    }

    return {
      electedOfficeId: electedOffice.id,
      organizationSlug: electedOffice.organizationSlug,
      clerkUserId: user.clerkId,
      city,
      state,
      office,
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

    const electedOfficeId = readStringField(run.params, 'elected_office_id')
    if (!electedOfficeId) {
      this.logger.error(
        { runId: run.runId },
        'meeting_briefing run missing elected_office_id param',
      )
      return
    }

    const raw = await this.s3.getFile(run.artifactBucket, run.artifactKey)
    if (!raw) {
      this.logger.error(
        { runId: run.runId },
        'meeting_briefing artifact missing from S3',
      )
      return
    }

    let parsed: Briefing
    try {
      parsed = parseBriefing(raw)
    } catch {
      this.logger.error(
        { runId: run.runId },
        'meeting_briefing artifact is not valid JSON',
      )
      return
    }
    const dateString = parsed.meeting?.scheduledAt?.slice(0, 10) ?? ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      this.logger.error(
        { runId: run.runId, dateString },
        'meeting_briefing artifact has invalid meeting.scheduledAt',
      )
      return
    }

    const schedule = await this.loadLatestScheduleForOrg(run.organizationSlug)
    if (!schedule || schedule.status === 'not_found') {
      this.logger.error(
        { runId: run.runId, organizationSlug: run.organizationSlug },
        'meeting_briefing completed but no schedule found for the org',
      )
      return
    }
    const meetingTime = schedule.time
    const meetingTimezone = schedule.timezone

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
      },
      update: {
        meetingTime,
        meetingTimezone,
        experimentRunId: run.runId,
        artifactBucket: run.artifactBucket,
        artifactKey: run.artifactKey,
      },
    })
  }
}
