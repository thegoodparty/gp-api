import { ReqElectedOffice } from '@/electedOffice/decorators/ReqElectedOffice.decorator'
import { UseElectedOffice } from '@/electedOffice/decorators/UseElectedOffice.decorator'
import { Controller, Get, Param, Query, UsePipes } from '@nestjs/common'
import { ElectedOffice } from '@prisma/client'
import { ZodValidationPipe } from 'nestjs-zod'
import {
  ConstituentIssuesParamsDTO,
  ConstituentIssuesQueryDTO,
  IndividualActivityParamsDTO,
  IndividualActivityQueryDTO,
} from './contactEngagement.schema'
import { ContactEngagementService } from './contactEngagement.service'
import { GetIndividualActivitiesResponse } from './contactEngagement.types'

@Controller('contact-engagement')
@UsePipes(ZodValidationPipe)
@UseElectedOffice({ param: 'electedOfficeId' })
export class ContactEngagementController {
  constructor(
    private readonly contactEngagementService: ContactEngagementService,
  ) {}

  @Get(':id/activities')
  async getIndividualActivities(
    @Param() params: IndividualActivityParamsDTO,
    @Query() query: IndividualActivityQueryDTO,
    @ReqElectedOffice() electedOffice: ElectedOffice,
  ): Promise<GetIndividualActivitiesResponse> {
    return this.contactEngagementService.getIndividualActivities({
      personId: params.id,
      ...query,
      electedOfficeId: electedOffice.id,
    })
  }

  @Get(':id/issues')
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
