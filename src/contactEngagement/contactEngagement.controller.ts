import { ReqUser } from '@/authentication/decorators/ReqUser.decorator'
import { ReqElectedOffice } from '@/electedOffice/decorators/ReqElectedOffice.decorator'
import { UseElectedOffice } from '@/electedOffice/decorators/UseElectedOffice.decorator'
import { ElectedOfficeService } from '@/electedOffice/services/electedOffice.service'
import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  UsePipes,
} from '@nestjs/common'
import { ElectedOffice, User } from '@prisma/client'
import { ZodValidationPipe } from 'nestjs-zod'
import { GetIndividualActivitiesResponse } from './contactEngagement.types'
import {
  ConstituentIssuesParamsDTO,
  ConstituentIssuesQueryDTO,
  IndividualActivityParamsDTO,
  IndividualActivityQueryDTO,
} from './contactEngagement.schema'
import { ContactEngagementService } from './contactEngagement.service'

@Controller('contact-engagement')
@UsePipes(ZodValidationPipe)
export class ContactEngagementController {
  constructor(
    private readonly contactEngagementService: ContactEngagementService,
    private readonly electedOfficeService: ElectedOfficeService,
  ) {}

  @Get(':id/activities')
  async getIndividualActivities(
    @Param() params: IndividualActivityParamsDTO,
    @Query() query: IndividualActivityQueryDTO,
    @ReqUser() user: User,
  ): Promise<GetIndividualActivitiesResponse> {
    const existing = await this.electedOfficeService.getCurrentElectedOffice(
      user.id,
    )
    if (!existing) {
      throw new ForbiddenException(
        'Access to constituent activities requires an elected office',
      )
    }

    return this.contactEngagementService.getIndividualActivities({
      personId: params.id,
      ...query,
      electedOfficeId: existing.id,
    })
  }

  @Get(':id/issues')
  @UseElectedOffice()
  async getConstituentIssues(
    @Param() params: ConstituentIssuesParamsDTO,
    @Query() query: ConstituentIssuesQueryDTO,
    @ReqElectedOffice() electedOffice: ElectedOffice,
  ) {
    return this.contactEngagementService.getConstituentIssues(
      params.id,
      electedOffice.id,
      query.take,
      query.after,
    )
  }
}
