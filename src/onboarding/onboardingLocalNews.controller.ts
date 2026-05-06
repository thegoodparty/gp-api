import { Controller, Get, Query, UsePipes } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { GetLocalNewsQueryDTO } from './schemas/getLocalNews.schema'
import { OnboardingLocalNewsService } from './services/localNews.service'

@Controller('onboarding/local-news')
@UsePipes(ZodValidationPipe)
export class OnboardingLocalNewsController {
  constructor(private readonly localNewsService: OnboardingLocalNewsService) {}

  @Get()
  getLocalNews(@Query() query: GetLocalNewsQueryDTO) {
    return this.localNewsService.getLocalNews({
      city: query.city,
      state: query.state,
      office: query.office,
    })
  }
}
