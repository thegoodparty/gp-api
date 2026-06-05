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
import { ElectedOffice, User } from '../../generated/prisma'
import {
  AnnotationResponseSchema,
  AttachmentDownloadUrlResponseSchema,
  AttachmentPresignRequest,
  AttachmentPresignRequestSchema,
  UpdateNoteRequest,
  UpdateNoteRequestSchema,
} from '@goodparty_org/contracts'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { ReqElectedOffice } from '@/electedOffice/decorators/ReqElectedOffice.decorator'
import { UseElectedOffice } from '@/electedOffice/decorators/UseElectedOffice.decorator'
import { ReqUser } from '@/authentication/decorators/ReqUser.decorator'
import { AnnotationsService } from '../services/annotations.service'
import { AnnotationAttachmentService } from '../services/annotationAttachment.service'

/**
 * Annotation-scoped routes addressed by annotation id directly. Briefing-scoped
 * list/create routes live on BriefingAnnotationsController.
 */
@Controller('annotations')
export class AnnotationsController {
  constructor(
    private readonly annotations: AnnotationsService,
    private readonly attachments: AnnotationAttachmentService,
  ) {}

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

  @UseElectedOffice()
  @Post(':annotationId/note/attachments/presign')
  async presignAttachment(
    @Param('annotationId') annotationId: string,
    @ReqUser() user: User,
    @ReqElectedOffice() electedOffice: ElectedOffice,
    @Body(new ZodValidationPipe(AttachmentPresignRequestSchema))
    body: AttachmentPresignRequest,
  ) {
    return this.attachments.createPresign(
      annotationId,
      user.id,
      electedOffice,
      body,
    )
  }

  @UseElectedOffice()
  @Post(':annotationId/note/attachments/:attachmentId/complete')
  @HttpCode(204)
  async completeAttachment(
    @Param('annotationId') annotationId: string,
    @Param('attachmentId') attachmentId: string,
    @ReqUser() user: User,
    @ReqElectedOffice() electedOffice: ElectedOffice,
  ): Promise<void> {
    await this.attachments.completeUpload(
      annotationId,
      attachmentId,
      user.id,
      electedOffice,
    )
  }

  @UseElectedOffice()
  @Get(':annotationId/note/attachments/:attachmentId/download-url')
  @ResponseSchema(AttachmentDownloadUrlResponseSchema)
  async getAttachmentDownloadUrl(
    @Param('annotationId') annotationId: string,
    @Param('attachmentId') attachmentId: string,
    @ReqUser() user: User,
    @ReqElectedOffice() electedOffice: ElectedOffice,
  ) {
    return this.attachments.createDownloadUrl(
      annotationId,
      attachmentId,
      user.id,
      electedOffice,
    )
  }

  @UseElectedOffice()
  @Delete(':annotationId/note/attachments/:attachmentId')
  @HttpCode(204)
  async deleteAttachment(
    @Param('annotationId') annotationId: string,
    @Param('attachmentId') attachmentId: string,
    @ReqUser() user: User,
    @ReqElectedOffice() electedOffice: ElectedOffice,
  ): Promise<void> {
    await this.attachments.deleteAttachment(
      annotationId,
      attachmentId,
      user.id,
      electedOffice,
    )
  }
}
