import { ReqElectedOffice } from '@/electedOffice/decorators/ReqElectedOffice.decorator'
import { UseElectedOffice } from '@/electedOffice/decorators/UseElectedOffice.decorator'
import { ElectedOfficeService } from '@/electedOffice/services/electedOffice.service'
import { Controller, Get, Param, Query, UsePipes } from '@nestjs/common'
import { ElectedOffice } from '@prisma/client'
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
    @ReqElectedOffice() electedOffice: ElectedOffice,
  ): Promise<GetIndividualActivitiesResponse> {
    return this.contactEngagementService.getIndividualActivities({
      personId: params.id,
      ...query,
      electedOfficeId: electedOffice.id,
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
