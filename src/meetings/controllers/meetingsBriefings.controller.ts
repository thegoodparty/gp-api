import { Controller, Get, NotFoundException, Param } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { ElectedOffice } from '@prisma/client'
import { addMonths, subMonths } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import {
  MeetingBriefingResponseSchema,
  MeetingsListResponseSchema,
} from '@goodparty_org/contracts'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { ReqElectedOffice } from '@/electedOffice/decorators/ReqElectedOffice.decorator'
import { UseElectedOffice } from '@/electedOffice/decorators/UseElectedOffice.decorator'
import {
  MeetingDateParam,
  MeetingDateParamSchema,
} from '../schemas/meetingDateParam.schema'
import { MeetingBriefingsService } from '../services/meetingBriefings.service'

@Controller('meetings')
export class MeetingsBriefingsController {
  constructor(private readonly meetingBriefings: MeetingBriefingsService) {}

  @UseElectedOffice()
  @Get()
  @ResponseSchema(MeetingsListResponseSchema)
  async list(@ReqElectedOffice() electedOffice: ElectedOffice) {
    const schedule = await this.meetingBriefings.loadLatestScheduleForOrg(
      electedOffice.organizationSlug,
    )
    if (!schedule || schedule.status === 'not_found') {
      return { schedule_known: false, meetings: [] }
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
      schedule_known: true,
      meetings: dates.map((d) => ({
        meeting_date: d,
        meeting_time: schedule.time,
        meeting_timezone: schedule.timezone,
        duration_minutes: schedule.duration_minutes,
        has_briefing: haveBriefing.has(d),
      })),
    }
  }

  @UseElectedOffice()
  @Get(':date/briefing')
  @ResponseSchema(MeetingBriefingResponseSchema)
  async getBriefing(
    @ReqElectedOffice() electedOffice: ElectedOffice,
    @Param(new ZodValidationPipe(MeetingDateParamSchema))
    { date }: MeetingDateParam,
  ) {
    const briefing = await this.meetingBriefings.loadBriefingArtifact(
      electedOffice.id,
      new Date(date),
    )
    if (!briefing) throw new NotFoundException()
    return briefing
  }
}
