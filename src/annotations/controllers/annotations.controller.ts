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
import { AnnotationsService } from '../services/annotations.service'

@Controller()
export class AnnotationsController {
  constructor(private readonly annotations: AnnotationsService) {}

  @UseElectedOffice()
  @Get('meeting-briefings/:briefingId/annotations')
  @ResponseSchema(AnnotationsListResponseSchema)
  async list(
    @Param('briefingId') briefingId: string,
    @ReqUser() user: User,
    @ReqElectedOffice() electedOffice: ElectedOffice,
  ) {
    const annotations = await this.annotations.listForBriefing(
      briefingId,
      user.id,
      electedOffice,
    )
    return { annotations }
  }

  @UseElectedOffice()
  @Post('meeting-briefings/:briefingId/annotations')
  @ResponseSchema(AnnotationResponseSchema)
  async create(
    @Param('briefingId') briefingId: string,
    @ReqUser() user: User,
    @ReqElectedOffice() electedOffice: ElectedOffice,
    @Body(new ZodValidationPipe(CreateAnnotationRequestSchema))
    body: CreateAnnotationRequest,
  ) {
    return this.annotations.createForBriefing(
      briefingId,
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
