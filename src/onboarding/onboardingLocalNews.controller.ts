import { Controller, Get, Query, UsePipes } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { PublicAccess } from '@/authentication/decorators/PublicAccess.decorator'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import {
  GetLocalNewsQueryDTO,
  localNewsResponseSchema,
} from './schemas/getLocalNews.schema'
import { OnboardingLocalNewsService } from './services/localNews.service'

@Controller('onboarding/local-news')
@UsePipes(ZodValidationPipe)
@PublicAccess()
export class OnboardingLocalNewsController {
  constructor(private readonly localNewsService: OnboardingLocalNewsService) {}

  @Get()
  @ResponseSchema(localNewsResponseSchema)
  getLocalNews(@Query() query: GetLocalNewsQueryDTO) {
    return this.localNewsService.getLocalNews({
      city: query.city,
      state: query.state,
      office: query.office,
    })
  }
}
