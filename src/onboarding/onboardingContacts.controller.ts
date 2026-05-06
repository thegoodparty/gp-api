import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { PublicAccess } from 'src/authentication/decorators/PublicAccess.decorator'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { ZodResponseInterceptor } from '@/shared/interceptors/ZodResponse.interceptor'
import { ContactsService } from '@/contacts/services/contacts.service'
import {
  GetOnboardingStatsQueryDTO,
  onboardingStatsResponseSchema,
} from './schemas/getOnboardingStats.schema'

@Controller('onboarding/contacts')
@PublicAccess()
@UsePipes(ZodValidationPipe)
@UseInterceptors(ZodResponseInterceptor)
export class OnboardingContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get('stats')
  @ResponseSchema(onboardingStatsResponseSchema)
  async getOnboardingStats(@Query() query: GetOnboardingStatsQueryDTO) {
    let districtId = query.districtId

    if (!districtId && query.ballotReadyPositionId) {
      districtId = await this.contactsService.resolveDistrictIdFromPosition(
        query.ballotReadyPositionId,
      )
    }

    if (!districtId) {
      throw new BadRequestException(
        'Could not resolve a district from the provided' +
          ' districtId or ballotReadyPositionId',
      )
    }

    return this.contactsService.fetchStatsByDistrictId(districtId)
  }
}
