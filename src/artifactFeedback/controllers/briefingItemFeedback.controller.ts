import { Body, Controller, Delete, HttpCode, Param, Put } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { ElectedOffice, User } from '../../generated/prisma'
import {
  ArtifactFeedbackResponseSchema,
  SetArtifactFeedbackRequest,
  SetArtifactFeedbackRequestSchema,
} from '@goodparty_org/contracts'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { ReqElectedOffice } from '@/electedOffice/decorators/ReqElectedOffice.decorator'
import { UseElectedOffice } from '@/electedOffice/decorators/UseElectedOffice.decorator'
import { ReqUser } from '@/authentication/decorators/ReqUser.decorator'
import {
  BriefingItemParam,
  BriefingItemParamSchema,
} from '../schemas/briefingItemParam.schema'
import { ArtifactFeedbackService } from '../services/artifactFeedback.service'

@Controller('meetings/:date/briefing/items/:itemId/feedback')
export class BriefingItemFeedbackController {
  constructor(private readonly feedback: ArtifactFeedbackService) {}

  @UseElectedOffice()
  @Put()
  @ResponseSchema(ArtifactFeedbackResponseSchema)
  async set(
    @Param(new ZodValidationPipe(BriefingItemParamSchema))
    { date, itemId }: BriefingItemParam,
    @ReqUser() user: User,
    @ReqElectedOffice() electedOffice: ElectedOffice,
    @Body(new ZodValidationPipe(SetArtifactFeedbackRequestSchema))
    body: SetArtifactFeedbackRequest,
  ) {
    return this.feedback.setForItem({
      meetingDate: date,
      itemId,
      userId: user.id,
      electedOffice,
      feedback: body.feedback,
      comment: body.comment,
    })
  }

  @UseElectedOffice()
  @Delete()
  @HttpCode(204)
  async clear(
    @Param(new ZodValidationPipe(BriefingItemParamSchema))
    { date, itemId }: BriefingItemParam,
    @ReqUser() user: User,
    @ReqElectedOffice() electedOffice: ElectedOffice,
  ): Promise<void> {
    await this.feedback.clearForItem({
      meetingDate: date,
      itemId,
      userId: user.id,
      electedOffice,
    })
  }
}
