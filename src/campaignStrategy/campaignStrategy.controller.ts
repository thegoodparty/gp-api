import {
  Controller,
  HttpStatus,
  Post,
  Res,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common'
import { FastifyReply } from 'fastify'
import { PinoLogger } from 'nestjs-pino'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqCampaign } from '@/campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from '@/campaigns/decorators/UseCampaign.decorator'
import { CampaignWith } from '@/campaigns/campaigns.types'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { ZodResponseInterceptor } from '@/shared/interceptors/ZodResponse.interceptor'
import { CampaignStrategyService } from './services/campaignStrategy.service'
import {
  CommunityEventsResponse,
  CommunityEventsResponseSchema,
} from '@goodparty_org/contracts'
import {
  StrategicLandscapeResponse,
  StrategicLandscapeResponseSchema,
} from './schemas/strategicLandscape.schema'

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
  @ResponseSchema(StrategicLandscapeResponseSchema)
  @UseCampaign({ include: { user: true } })
  async generateStrategicLandscape(
    @ReqCampaign() campaign: CampaignWith<'user'>,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<StrategicLandscapeResponse> {
    const response =
      await this.campaignStrategy.getOrGenerateStrategicLandscape(campaign)
    if (response.status === 'generating') {
      res.status(HttpStatus.ACCEPTED)
    }
    return response
  }

  @Post('mine/community-events')
  @ResponseSchema(CommunityEventsResponseSchema)
  @UseCampaign({ include: { user: true } })
  async generateCommunityEvents(
    @ReqCampaign() campaign: CampaignWith<'user'>,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<CommunityEventsResponse> {
    const response =
      await this.campaignStrategy.getOrGenerateCommunityEvents(campaign)
    if (response.status === 'generating') {
      res.status(HttpStatus.ACCEPTED)
    }
    return response
  }
}
