import { Controller, Get, Query, UsePipes } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { GetOnboardingStatsQueryDTO } from './schemas/getOnboardingStats.schema'
import { ContactsService } from './services/contacts.service'

@Controller('onboarding/contacts')
@UsePipes(ZodValidationPipe)
export class OnboardingContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get('stats')
  getOnboardingStats(@Query() query: GetOnboardingStatsQueryDTO) {
    return this.contactsService.getDistrictStatsByDistrictOrPosition({
      districtId: query.districtId,
      ballotReadyPositionId: query.ballotReadyPositionId,
    })
  }
}
