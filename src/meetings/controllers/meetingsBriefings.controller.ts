import { Controller, Get, NotFoundException, Param } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { ElectedOffice } from '@prisma/client'
import { addMonths, subMonths } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { ReqElectedOffice } from '@/electedOffice/decorators/ReqElectedOffice.decorator'
import { UseElectedOffice } from '@/electedOffice/decorators/UseElectedOffice.decorator'
import { S3Service } from '@/vendors/aws/services/s3.service'
import {
  MeetingDateParam,
  MeetingDateParamSchema,
} from '../schemas/meetingDateParam.schema'
import { MeetingBriefingsService } from '../services/meetingBriefings.service'

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
    if (!schedule || schedule.status === 'not_found') {
      return { scheduleKnown: false, meetings: [] }
    }

    const now = new Date()
    const dates = this.meetingBriefings.projectMeetingDates({
      schedule,
      from: subMonths(now, 2),
      to: addMonths(now, 3),
    })

    const briefings = await this.meetingBriefings.findMany({
      where: {
        electedOfficeId: electedOffice.id,
        meetingDate: { in: dates.map((d) => new Date(d)) },
      },
      select: { meetingDate: true },
    })
    const haveBriefing = new Set(
      briefings.map((b) =>
        formatInTimeZone(b.meetingDate, 'UTC', 'yyyy-MM-dd'),
      ),
    )

    return {
      scheduleKnown: true,
      meetings: dates.map((d) => ({
        meetingDate: d,
        meetingTime: schedule.time,
        meetingTimezone: schedule.timezone,
        durationMinutes: schedule.duration_minutes,
        meetingName: schedule.meeting_name,
        location: schedule.location,
        hasBriefing: haveBriefing.has(d),
      })),
    }
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
          meetingDate: new Date(date),
        },
      },
    })
    if (!row) throw new NotFoundException()

    const raw = await this.s3.getFile(row.artifactBucket, row.artifactKey)
    if (!raw) throw new NotFoundException()

    // JSON.parse returns unknown — pass through artifact as-is
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return JSON.parse(raw)
  }
}
