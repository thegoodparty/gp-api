import { Controller, Get, Param } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { ElectedOffice, User } from '@prisma/client'
import { BriefingFeedbackListResponseSchema } from '@goodparty_org/contracts'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { ReqElectedOffice } from '@/electedOffice/decorators/ReqElectedOffice.decorator'
import { UseElectedOffice } from '@/electedOffice/decorators/UseElectedOffice.decorator'
import { ReqUser } from '@/authentication/decorators/ReqUser.decorator'
import {
  MeetingDateParam,
  MeetingDateParamSchema,
} from '@/meetings/schemas/meetingDateParam.schema'
import { ArtifactFeedbackService } from '../services/artifactFeedback.service'

@Controller('meetings/:date/briefing/feedback')
export class BriefingFeedbackController {
  constructor(private readonly feedback: ArtifactFeedbackService) {}

  @UseElectedOffice()
  @Get()
  @ResponseSchema(BriefingFeedbackListResponseSchema)
  async list(
    @Param(new ZodValidationPipe(MeetingDateParamSchema))
    { date }: MeetingDateParam,
    @ReqUser() user: User,
    @ReqElectedOffice() electedOffice: ElectedOffice,
  ) {
    const feedback = await this.feedback.listMineForBriefing({
      meetingDate: date,
      userId: user.id,
      electedOffice,
    })
    return { feedback }
  }
}
