import { Controller, Post, UseInterceptors, UsePipes } from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqCampaign } from '@/campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from '@/campaigns/decorators/UseCampaign.decorator'
import { CampaignWith } from '@/campaigns/campaigns.types'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { ZodResponseInterceptor } from '@/shared/interceptors/ZodResponse.interceptor'
import { CampaignStrategyService } from './services/campaignStrategy.service'
import { StrategicLandscapeResultSchema } from './schemas/strategicLandscape.schema'

@Controller('campaignStrategy')
@UsePipes(ZodValidationPipe)
@UseInterceptors(ZodResponseInterceptor)
export class CampaignStrategyController {
  constructor(
    private readonly campaignStrategy: CampaignStrategyService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CampaignStrategyController.name)
  }

  @Post('mine/strategic-landscape')
  @ResponseSchema(StrategicLandscapeResultSchema)
  @UseCampaign({ include: { user: true } })
  async generateStrategicLandscape(
    @ReqCampaign() campaign: CampaignWith<'user'>,
  ) {
    return this.campaignStrategy.getOrGenerateStrategicLandscape(campaign)
  }
}
