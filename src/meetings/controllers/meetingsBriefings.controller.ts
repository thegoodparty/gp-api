import { Controller, Get, NotFoundException, Param } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { ElectedOffice } from '@prisma/client'
import { addMonths, subDays } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { ReqElectedOffice } from '@/electedOffice/decorators/ReqElectedOffice.decorator'
import { UseElectedOffice } from '@/electedOffice/decorators/UseElectedOffice.decorator'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { parseIsoDateAsUTC } from '@/shared/util/date.util'
import {
  MeetingDateParam,
  MeetingDateParamSchema,
} from '../schemas/meetingDateParam.schema'
import { MeetingBriefingsService } from '../services/meetingBriefings.service'

type MeetingListItem = {
  meetingDate: string
  meetingTime: string
  meetingTimezone: string
  durationMinutes: number
  meetingName: string
  location: string
  hasBriefing: boolean
}

@Controller('meetings')
export class MeetingsBriefingsController {
  constructor(
    private readonly meetingBriefings: MeetingBriefingsService,
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
    if (!row) throw new NotFoundException()

    const raw = await this.s3.getFile(row.artifactBucket, row.artifactKey)
    if (!raw) throw new NotFoundException()

    try {
      // JSON.parse returns unknown — pass through artifact as-is
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return JSON.parse(raw)
    } catch {
      throw new NotFoundException()
    }
  }
}
