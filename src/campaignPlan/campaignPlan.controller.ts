import { Controller, Post, UseInterceptors, UsePipes } from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqCampaign } from '@/campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from '@/campaigns/decorators/UseCampaign.decorator'
import { CampaignWith } from '@/campaigns/campaigns.types'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { ZodResponseInterceptor } from '@/shared/interceptors/ZodResponse.interceptor'
import { CampaignPlanService } from './services/campaignPlan.service'
import { StrategicLandscapeResultSchema } from './schemas/strategicLandscape.schema'

@Controller('campaignPlan')
@UsePipes(ZodValidationPipe)
@UseInterceptors(ZodResponseInterceptor)
export class CampaignPlanController {
  constructor(
    private readonly campaignPlan: CampaignPlanService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CampaignPlanController.name)
  }

  @Post('mine/strategic-landscape')
  @ResponseSchema(StrategicLandscapeResultSchema)
  @UseCampaign({ include: { user: true } })
  async generateStrategicLandscape(
    @ReqCampaign() campaign: CampaignWith<'user'>,
  ) {
    return this.campaignPlan.getOrGenerateStrategicLandscape(campaign)
  }
}
