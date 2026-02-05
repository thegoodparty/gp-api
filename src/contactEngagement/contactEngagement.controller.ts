import { ReqUser } from '@/authentication/decorators/ReqUser.decorator'
import { ElectedOfficeService } from '@/electedOffice/services/electedOffice.service'
import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  UsePipes,
} from '@nestjs/common'
import { User } from '@prisma/client'
import { ZodValidationPipe } from 'nestjs-zod'
import { GetIndividualActivitiesResponse } from './contactEngagement.types'
import {
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

  @Get('/:id/activities')
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
}
