import { Body, Controller, Delete, HttpCode, Param, Put } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { ElectedOffice, User } from '@prisma/client'
import {
  AnnotationResponseSchema,
  UpdateNoteRequest,
  UpdateNoteRequestSchema,
} from '@goodparty_org/contracts'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { ReqElectedOffice } from '@/electedOffice/decorators/ReqElectedOffice.decorator'
import { UseElectedOffice } from '@/electedOffice/decorators/UseElectedOffice.decorator'
import { ReqUser } from '@/authentication/decorators/ReqUser.decorator'
import { AnnotationsService } from '../services/annotations.service'

/**
 * Annotation-scoped routes addressed by annotation id directly. Briefing-scoped
 * list/create routes live on BriefingAnnotationsController.
 */
@Controller('annotations')
export class AnnotationsController {
  constructor(private readonly annotations: AnnotationsService) {}

  @UseElectedOffice()
  @Put(':annotationId/note')
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
  @Delete(':annotationId')
  @HttpCode(204)
  async remove(
    @Param('annotationId') annotationId: string,
    @ReqUser() user: User,
    @ReqElectedOffice() electedOffice: ElectedOffice,
  ): Promise<void> {
    await this.annotations.deleteOne(annotationId, user.id, electedOffice)
  }
}
