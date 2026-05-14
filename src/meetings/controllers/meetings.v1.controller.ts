import { Controller, Get, NotFoundException, Param } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { ElectedOffice } from '@prisma/client'
import { addMonths, subMonths } from 'date-fns'
import {
  MeetingBriefingResponseSchema,
  MeetingsListResponseSchema,
} from '@goodparty_org/contracts'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { ReqElectedOffice } from '@/electedOffice/decorators/ReqElectedOffice.decorator'
import { UseElectedOffice } from '@/electedOffice/decorators/UseElectedOffice.decorator'
import { S3Service } from '@/vendors/aws/services/s3.service'
import {
  MeetingDateParam,
  MeetingDateParamSchema,
} from '../schemas/meetingDateParam.schema'
import { MeetingBriefingsService } from '../services/meetingBriefings.service'
import { MeetingScheduleService } from '../services/meetingSchedule.service'
import { MeetingProjectionService } from '../services/meetingProjection.service'

const toCamel = (raw: unknown): unknown => {
  if (Array.isArray(raw)) return raw.map(toCamel)
  if (raw && typeof raw === 'object') {
    return Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [
        k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
        toCamel(v),
      ]),
    )
  }
  return raw
}

@Controller('v1/meetings')
export class MeetingsV1Controller {
  constructor(
    private readonly meetingBriefings: MeetingBriefingsService,
    private readonly schedules: MeetingScheduleService,
    private readonly projections: MeetingProjectionService,
    private readonly s3: S3Service,
  ) {}

  @UseElectedOffice()
  @Get()
  @ResponseSchema(MeetingsListResponseSchema)
  async list(@ReqElectedOffice() electedOffice: ElectedOffice) {
    const schedule = await this.schedules.loadLatestForOrg(
      electedOffice.organizationSlug,
    )
    if (!schedule || schedule.status === 'not_found') {
      return { scheduleKnown: false, meetings: [] }
    }

    const now = new Date()
    const dates = this.projections.project({
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
      briefings.map((b) => b.meetingDate.toISOString().slice(0, 10)),
    )

    return {
      scheduleKnown: true,
      meetings: dates.map((d) => ({
        meetingDate: d,
        meetingTime: schedule.time,
        meetingTimezone: schedule.timezone,
        durationMinutes: schedule.durationMinutes,
        hasBriefing: haveBriefing.has(d),
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

    return MeetingBriefingResponseSchema.parse(toCamel(JSON.parse(raw)))
  }
}
