import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { ElectedOffice, User } from '@prisma/client'
import {
  AnnotationResponseSchema,
  AnnotationsListResponseSchema,
  CreateAnnotationRequest,
  CreateAnnotationRequestSchema,
  UpdateNoteRequest,
  UpdateNoteRequestSchema,
} from '@goodparty_org/contracts'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { ReqElectedOffice } from '@/electedOffice/decorators/ReqElectedOffice.decorator'
import { UseElectedOffice } from '@/electedOffice/decorators/UseElectedOffice.decorator'
import { ReqUser } from '@/authentication/decorators/ReqUser.decorator'
import {
  MeetingDateParam,
  MeetingDateParamSchema,
} from '@/meetings/schemas/meetingDateParam.schema'
import { AnnotationsService } from '../services/annotations.service'

/**
 * Briefing annotations.
 *
 * Briefings are addressed by `(elected office, meeting date)`, matching the
 * URL pattern of `GET /v1/meetings/:date/briefing`. The MeetingBriefing
 * row's UUID is resolved server-side and stored as the annotation's
 * `resourceId`; the frontend only ever sees the date.
 *
 * Annotation IDs are generated server-side, so update and delete are
 * addressed by the annotation's own id directly.
 */
@Controller()
export class AnnotationsController {
  constructor(private readonly annotations: AnnotationsService) {}

  @UseElectedOffice()
  @Get('meetings/:date/briefing/annotations')
  @ResponseSchema(AnnotationsListResponseSchema)
  async list(
    @Param(new ZodValidationPipe(MeetingDateParamSchema))
    { date }: MeetingDateParam,
    @ReqUser() user: User,
    @ReqElectedOffice() electedOffice: ElectedOffice,
  ) {
    const annotations = await this.annotations.listForBriefing(
      date,
      user.id,
      electedOffice,
    )
    return { annotations }
  }

  @UseElectedOffice()
  @Post('meetings/:date/briefing/annotations')
  @ResponseSchema(AnnotationResponseSchema)
  async create(
    @Param(new ZodValidationPipe(MeetingDateParamSchema))
    { date }: MeetingDateParam,
    @ReqUser() user: User,
    @ReqElectedOffice() electedOffice: ElectedOffice,
    @Body(new ZodValidationPipe(CreateAnnotationRequestSchema))
    body: CreateAnnotationRequest,
  ) {
    return this.annotations.createForBriefing(
      date,
      user.id,
      electedOffice,
      body,
    )
  }

  @UseElectedOffice()
  @Put('annotations/:annotationId/note')
  @ResponseSchema(AnnotationResponseSchema)
  async updateNote(
    @Param('annotationId') annotationId: string,
    @ReqUser() user: User,
    @ReqElectedOffice() electedOffice: ElectedOffice,
    @Body(new ZodValidationPipe(UpdateNoteRequestSchema))
    body: UpdateNoteRequest,
  ) {
    return this.annotations.updateNoteBody(
      annotationId,
      user.id,
      electedOffice,
      body.body,
    )
  }

  @UseElectedOffice()
  @Delete('annotations/:annotationId')
  @HttpCode(204)
  async remove(
    @Param('annotationId') annotationId: string,
    @ReqUser() user: User,
    @ReqElectedOffice() electedOffice: ElectedOffice,
  ): Promise<void> {
    await this.annotations.deleteOne(annotationId, user.id, electedOffice)
  }
}
