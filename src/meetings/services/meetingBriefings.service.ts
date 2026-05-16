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
import { MeetingSchedule } from '@/generated/agent-job-contracts'
import { getUserFullName } from '@/users/util/users.util'

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
        state: ctx.state,
        office: ctx.positionName,
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
        officialName: ctx.officialName,
        state: ctx.state,
        positionName: ctx.positionName,
        ...(ctx.l2DistrictType ? { l2DistrictType: ctx.l2DistrictType } : {}),
        ...(ctx.l2DistrictName ? { l2DistrictName: ctx.l2DistrictName } : {}),
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
        officialName: ctx.officialName,
        state: ctx.state,
        positionName: ctx.positionName,
        ...(ctx.l2DistrictType ? { l2DistrictType: ctx.l2DistrictType } : {}),
        ...(ctx.l2DistrictName ? { l2DistrictName: ctx.l2DistrictName } : {}),
      },
    })
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
        select: { positionId: true, customPositionName: true },
      }),
    ])

    if (!user?.clerkId) {
      this.logger.warn(
        { electedOfficeId: electedOffice.id },
        'skipping dispatch: user has no clerkId',
      )
      return null
    }

    const position = organization?.positionId
      ? await this.elections.getPositionById(organization.positionId, {
          includeDistrict: true,
        })
      : null
    const state = position?.state ?? ''
    const positionName =
      organization?.customPositionName ?? position?.name ?? ''
    const officialName = getUserFullName(user)

    if (!state || !positionName || !officialName) {
      this.logger.warn(
        {
          electedOfficeId: electedOffice.id,
          missing: {
            state: !state,
            positionName: !positionName,
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
      state,
      positionName,
      l2DistrictType: position?.district?.L2DistrictType,
      l2DistrictName: position?.district?.L2DistrictName,
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
      select: { id: true },
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
  }
}
