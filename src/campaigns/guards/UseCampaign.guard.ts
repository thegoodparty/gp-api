import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Campaign } from '@prisma/client'
import { Reflector } from '@nestjs/core'
import { CampaignsService } from '../services/campaigns.service'
import {
  REQUIRE_CAMPAIGN_META_KEY,
  RequireCamapaignMetadata,
} from '../decorators/UseCampaign.decorator'
import { CampaignWith } from '../campaigns.types'
import { PinoLogger } from 'nestjs-pino'

@Injectable()
/**
 * Restrict an endpoint to require user to have a campaign
 * Do not need to apply this directly, use the "@UseCampaign" decorator
 * */
export class UseCampaignGuard implements CanActivate {
  constructor(
    private campaignsService: CampaignsService,
    private reflector: Reflector,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UseCampaignGuard.name)
  }

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      params: { slug: string }
      campaign?: Campaign
      user: { id: number }
    }>()

    const { continueIfNotFound, include: campaignInclude } =
      this.reflector.getAllAndOverride<RequireCamapaignMetadata>(
        REQUIRE_CAMPAIGN_META_KEY,
        [context.getHandler(), context.getClass()],
      )

    // load campaign for current user
    const campaign = await this.campaignsService.findByUserId(
      request.user.id,
      campaignInclude ?? { pathToVictory: true }, // default to include path to victory
    )

    if (campaign) {
      // store on request to access with @UserCampaign decorator
      request.campaign = campaign as CampaignWith<'pathToVictory'>
      return true
    } else if (continueIfNotFound === true) {
      // if continueIfNotFound, allow request handler to continue
      return true
    }

    this.logger.info('User has no campaign')
    throw new NotFoundException()
  }
}
