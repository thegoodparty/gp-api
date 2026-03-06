import { ReqOrganization } from '@/organizations/decorators/ReqOrganization.decorator'
import { UseOrganization } from '@/organizations/decorators/UseOrganization.decorator'
import { Controller, Get, Param, Query, UsePipes } from '@nestjs/common'
import { ElectedOffice, Organization } from '@prisma/client'
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
@UseOrganization({
  fallback: 'elected-office',
  include: { electedOffice: true },
})
export class ContactEngagementController {
  constructor(
    private readonly contactEngagementService: ContactEngagementService,
  ) {}

  @Get(':id/activities')
  async getIndividualActivities(
    @Param() params: IndividualActivityParamsDTO,
    @Query() query: IndividualActivityQueryDTO,
    @ReqOrganization()
    { electedOffice }: Organization & { electedOffice: ElectedOffice },
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
    @ReqOrganization()
    { electedOffice }: Organization & { electedOffice: ElectedOffice },
  ) {
    return this.contactEngagementService.getConstituentIssues(
      params.id,
      electedOffice.id,
      query.take,
      query.after,
    )
  }
}
