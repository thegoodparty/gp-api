import { Controller, Get, Query, UsePipes } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { PublicAccess } from '@/authentication/decorators/PublicAccess.decorator'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { GetOnboardingStatsQueryDTO } from './schemas/getOnboardingStats.schema'
import { onboardingStatsResponseSchema } from './schemas/onboardingStatsResponse.schema'
import { OnboardingContactsService } from './services/onboardingContacts.service'

@Controller('onboarding/contacts')
@UsePipes(ZodValidationPipe)
@PublicAccess()
export class OnboardingContactsController {
  constructor(private readonly onboardingContacts: OnboardingContactsService) {}

  @Get('stats')
  @ResponseSchema(onboardingStatsResponseSchema)
  getOnboardingStats(@Query() query: GetOnboardingStatsQueryDTO) {
    return this.onboardingContacts.getStatsByDistrictOrPosition({
      districtId: query.districtId,
      ballotReadyPositionId: query.ballotReadyPositionId,
    })
  }
}
