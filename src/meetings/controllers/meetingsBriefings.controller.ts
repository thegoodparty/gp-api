import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { ElectedOffice, User } from '../../generated/prisma'
import { addMonths, subDays } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { ReqElectedOffice } from '@/electedOffice/decorators/ReqElectedOffice.decorator'
import { UseElectedOffice } from '@/electedOffice/decorators/UseElectedOffice.decorator'
import { ReqUser } from '@/authentication/decorators/ReqUser.decorator'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { parseIsoDateAsUTC } from '@/shared/util/date.util'
import {
  MeetingDateParam,
  MeetingDateParamSchema,
} from '../schemas/meetingDateParam.schema'
import {
  DispatchMeetingAgentDto,
  DispatchMeetingAgentSchema,
} from '../schemas/dispatchMeetingAgent.schema'
import {
  UserAgendaFinalizeRequest,
  UserAgendaFinalizeRequestSchema,
  UserAgendaFinalizeResponseSchema,
  UserAgendaPresignRequest,
  UserAgendaPresignRequestSchema,
  UserAgendaPresignResponseSchema,
} from '../schemas/userAgendaUpload.schema'
import { MeetingBriefingsService } from '../services/meetingBriefings.service'
import { UserAgendaUploadService } from '../services/userAgendaUpload.service'

type UserAgendaStatus = 'processing' | 'failed' | 'completed' | 'unknown'

type MeetingListItem = {
  meetingDate: string
  meetingTime: string
  meetingTimezone: string
  durationMinutes: number
  meetingName: string
  location: string
  hasBriefing: boolean
  userAgendaStatus: UserAgendaStatus | null
}

@Controller('meetings')
export class MeetingsBriefingsController {
  constructor(
    private readonly meetingBriefings: MeetingBriefingsService,
    private readonly userAgendaUploads: UserAgendaUploadService,
    private readonly s3: S3Service,
  ) {}

  @UseElectedOffice()
  @Get()
  async list(@ReqElectedOffice() electedOffice: ElectedOffice) {
    const schedule = await this.meetingBriefings.loadLatestScheduleForOrg(
      electedOffice.organizationSlug,
    )
    const knownSchedule = schedule?.status === 'found' ? schedule : null

    const now = new Date()
    const windowFrom = parseIsoDateAsUTC(
      formatInTimeZone(subDays(now, 4), 'UTC', 'yyyy-MM-dd'),
    )
    const windowTo = addMonths(now, 3)
    const today = formatInTimeZone(now, 'UTC', 'yyyy-MM-dd')

    const projectedDates = knownSchedule
      ? this.meetingBriefings.projectMeetingDates({
          schedule: knownSchedule,
          from: windowFrom,
          to: windowTo,
        })
      : []

    const briefingRows = await this.meetingBriefings.findMany({
      where: {
        electedOfficeId: electedOffice.id,
        meetingDate: { gte: windowFrom, lte: windowTo },
      },
      select: {
        meetingDate: true,
        meetingTime: true,
        meetingTimezone: true,
        artifact: true,
      },
    })

    const byDate = new Map<string, MeetingListItem>()

    if (knownSchedule) {
      for (const date of projectedDates) {
        if (date < today) continue
        byDate.set(date, {
          meetingDate: date,
          meetingTime: knownSchedule.time,
          meetingTimezone: knownSchedule.timezone,
          durationMinutes: knownSchedule.duration_minutes,
          meetingName: knownSchedule.meeting_name,
          location: knownSchedule.location,
          hasBriefing: false,
          userAgendaStatus: null,
        })
      }
    }

    for (const row of briefingRows) {
      const date = formatInTimeZone(row.meetingDate, 'UTC', 'yyyy-MM-dd')
      const existing = byDate.get(date)
      const artifactName = row.artifact?.meeting_name
      const artifactLocation = row.artifact?.location
      byDate.set(date, {
        meetingDate: date,
        meetingTime: row.meetingTime,
        meetingTimezone: row.meetingTimezone,
        durationMinutes:
          existing?.durationMinutes ?? knownSchedule?.duration_minutes ?? 0,
        meetingName:
          artifactName ||
          existing?.meetingName ||
          knownSchedule?.meeting_name ||
          '',
        location:
          artifactLocation ||
          existing?.location ||
          knownSchedule?.location ||
          '',
        hasBriefing: true,
        userAgendaStatus: existing?.userAgendaStatus ?? null,
      })
    }

    // Layer in user-agenda statuses last so the GET row reflects the latest
    // user-upload state regardless of whether a briefing row exists yet
    // (the briefing row appears only AFTER the dispatched run completes).
    // The query is scoped to the same window as the meeting projection so
    // upload rows for off-list dates (no projected schedule entry, no
    // briefing row yet) still appear as their own list rows. Past-date
    // uploads within the window are also surfaced — the presign/finalize
    // endpoints accept any meetingDate, so a user who uploaded for a
    // recent meeting must still see its status (otherwise their submission
    // silently disappears from the list).
    const userAgendaStatuses =
      await this.userAgendaUploads.getStatusForMeetings(electedOffice.id, {
        from: windowFrom,
        to: windowTo,
      })
    for (const [date, status] of userAgendaStatuses) {
      const existing = byDate.get(date)
      if (existing) {
        byDate.set(date, { ...existing, userAgendaStatus: status })
        continue
      }
      // Off-list date: user uploaded an agenda for a meeting we don't have a
      // schedule entry or briefing row for. Surface as a row so the agenda is
      // visible — fill the schedule-only fields with placeholders.
      byDate.set(date, {
        meetingDate: date,
        meetingTime: '',
        meetingTimezone: '',
        durationMinutes: 0,
        meetingName: '',
        location: '',
        hasBriefing: false,
        userAgendaStatus: status,
      })
    }

    const meetings = [...byDate.values()].sort((a, b) =>
      a.meetingDate.localeCompare(b.meetingDate),
    )

    return { scheduleKnown: !!knownSchedule, meetings }
  }

  @UseElectedOffice()
  @Get(':date/briefing')
  async getBriefing(
    @ReqElectedOffice() electedOffice: ElectedOffice,
    @Param(new ZodValidationPipe(MeetingDateParamSchema))
    { date }: MeetingDateParam,
  ) {
    const row = await this.meetingBriefings.model.findUnique({
      where: {
        electedOfficeId_meetingDate: {
          electedOfficeId: electedOffice.id,
          meetingDate: parseIsoDateAsUTC(date),
        },
      },
    })
    if (!row) {
      const schedule = await this.meetingBriefings.loadLatestScheduleForOrg(
        electedOffice.organizationSlug,
      )
      const info = schedule?.status === 'found' ? schedule : null
      return {
        status: 'awaiting_agenda',
        meetingDate: date,
        meetingName: info?.meeting_name ?? '',
        meetingTime: info?.time ?? '',
        meetingTimezone: info?.timezone ?? '',
        location: info?.location ?? '',
        durationMinutes: info?.duration_minutes ?? 0,
      }
    }

    const raw = await this.s3.getFile(row.artifactBucket, row.artifactKey)
    if (!raw) throw new NotFoundException()

    let artifact: Record<string, unknown>
    try {
      // JSON.parse returns unknown — cast to a record so we can spread it back
      // out alongside `briefing_id` for the client.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      artifact = JSON.parse(raw) as Record<string, unknown>
    } catch {
      throw new NotFoundException()
    }
    return { ...artifact, briefing_id: row.id }
  }

  @Post('briefings/dispatch')
  async dispatchAgent(
    @Body(new ZodValidationPipe(DispatchMeetingAgentSchema))
    body: DispatchMeetingAgentDto,
  ) {
    const result = await this.meetingBriefings.dispatchManual(
      body.electedOfficeId,
      body.kind,
    )
    if (!result.dispatched) {
      throw new NotFoundException(
        'Could not resolve dispatch context for that elected office',
      )
    }
    return { dispatched: true, kind: body.kind }
  }

  /**
   * Step 1 of user-supplied agenda upload: returns a presigned S3 PUT URL
   * the browser uses to upload the PDF directly to the agent-run-inputs
   * bucket. No DB row is created here — finalizeUserAgenda creates the row
   * after the upload completes.
   */
  @UseElectedOffice()
  @Post(':date/briefing/agenda/presign')
  @ResponseSchema(UserAgendaPresignResponseSchema)
  async presignUserAgenda(
    @ReqElectedOffice() electedOffice: ElectedOffice,
    @Param(new ZodValidationPipe(MeetingDateParamSchema))
    { date }: MeetingDateParam,
    @Body(new ZodValidationPipe(UserAgendaPresignRequestSchema))
    body: UserAgendaPresignRequest,
  ) {
    return this.userAgendaUploads.createUploadPresign(electedOffice, date, body)
  }

  /**
   * Step 2 of user-supplied agenda upload (or sole step for URL paste):
   * persists the upload metadata and dispatches a fresh briefing run with
   * `agendaPacketUrl` set.
   */
  @UseElectedOffice()
  @Post(':date/briefing/agenda')
  @ResponseSchema(UserAgendaFinalizeResponseSchema)
  async finalizeUserAgenda(
    @ReqElectedOffice() electedOffice: ElectedOffice,
    @ReqUser() user: User,
    @Param(new ZodValidationPipe(MeetingDateParamSchema))
    { date }: MeetingDateParam,
    @Body(new ZodValidationPipe(UserAgendaFinalizeRequestSchema))
    body: UserAgendaFinalizeRequest,
  ) {
    const { experimentRunId } =
      await this.userAgendaUploads.finalizeAndDispatch(
        electedOffice,
        user.id,
        date,
        body,
      )
    return { experimentRunId, status: 'processing' as const }
  }
}
