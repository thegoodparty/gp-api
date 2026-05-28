import {
  Controller,
  Get,
  Query,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { Campaign } from '@prisma/client'
import { ReqCampaign } from '@/campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from '@/campaigns/decorators/UseCampaign.decorator'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { ZodResponseInterceptor } from '@/shared/interceptors/ZodResponse.interceptor'
import {
  GetLocalNewsQueryDTO,
  localNewsResponseSchema,
} from './schemas/getLocalNews.schema'
import { OnboardingLocalNewsService } from './services/localNews.service'

@Controller('onboarding/local-news')
@UsePipes(ZodValidationPipe)
@UseInterceptors(ZodResponseInterceptor)
export class OnboardingLocalNewsController {
  constructor(private readonly localNewsService: OnboardingLocalNewsService) {}

  @Get()
  @UseCampaign()
  @ResponseSchema(localNewsResponseSchema)
  getLocalNews(
    @Query() query: GetLocalNewsQueryDTO,
    @ReqCampaign() campaign: Campaign,
  ) {
    return this.localNewsService.getLocalNews({
      city: query.city,
      state: query.state,
      office: query.office,
      campaign,
    })
  }
}
