import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { ElectedOffice, User } from '../../generated/prisma'
import {
  AnnotationResponseSchema,
  AnnotationsListResponseSchema,
  CreateAnnotationRequest,
  CreateAnnotationRequestSchema,
} from '@goodparty_org/contracts'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { ReqElectedOffice } from '@/electedOffice/decorators/ReqElectedOffice.decorator'
import { UseElectedOffice } from '@/electedOffice/decorators/UseElectedOffice.decorator'
import { ReqUser } from '@/authentication/decorators/ReqUser.decorator'
import { IncomingRequest } from '@/authentication/authentication.types'
import {
  MeetingDateParam,
  MeetingDateParamSchema,
} from '@/meetings/schemas/meetingDateParam.schema'
import { AnnotationsService } from '../services/annotations.service'
import {
  ListAnnotationsQuery,
  ListAnnotationsQuerySchema,
} from '../schemas/listAnnotationsQuery.schema'

/**
 * Briefing-scoped annotation routes.
 *
 * Briefings are addressed by `(elected office, meeting date)`, matching the
 * URL pattern of `GET /v1/meetings/:date/briefing`. The MeetingBriefing
 * row's UUID is resolved server-side and stored as the annotation's
 * `resourceId`; the frontend only ever sees the date.
 */
@Controller('meetings/:date/briefing/annotations')
export class BriefingAnnotationsController {
  constructor(private readonly annotations: AnnotationsService) {}

  @UseElectedOffice()
  @Get()
  @ResponseSchema(AnnotationsListResponseSchema)
  async list(
    @Param(new ZodValidationPipe(MeetingDateParamSchema))
    { date }: MeetingDateParam,
    @Query(new ZodValidationPipe(ListAnnotationsQuerySchema))
    { kinds }: ListAnnotationsQuery,
    @ReqUser() user: User,
    @ReqElectedOffice() electedOffice: ElectedOffice,
    @Req() req: IncomingRequest,
  ) {
    const annotations = await this.annotations.listForBriefing(
      date,
      user.id,
      electedOffice,
      req.actorSub ?? null,
      kinds,
    )
    return { annotations }
  }

  @UseElectedOffice()
  @Post()
  @ResponseSchema(AnnotationResponseSchema)
  async create(
    @Param(new ZodValidationPipe(MeetingDateParamSchema))
    { date }: MeetingDateParam,
    @ReqUser() user: User,
    @ReqElectedOffice() electedOffice: ElectedOffice,
    @Body(new ZodValidationPipe(CreateAnnotationRequestSchema))
    body: CreateAnnotationRequest,
    @Req() req: IncomingRequest,
  ) {
    return this.annotations.createForBriefing(
      date,
      user.id,
      electedOffice,
      body,
      req.actorSub ?? null,
      req.actorUser ?? null,
    )
  }
}
