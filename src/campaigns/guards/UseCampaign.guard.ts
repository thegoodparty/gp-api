import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { CampaignsService } from '../services/campaigns.service'
import {
  REQUIRE_CAMPAIGN_META_KEY,
  RequireCamapaignMetadata,
} from '../decorators/UseCampaign.decorator'
import { CampaignWith } from '../campaigns.types'

@Injectable()
/**
 * Restrict an endpoint to require user to have a campaign
 * Do not need to apply this directly, use the "@UseCampaign" decorator
 * */
export class UseCampaignGuard implements CanActivate {
  private readonly logger = new Logger(UseCampaignGuard.name)

  constructor(
    private campaignsService: CampaignsService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest()

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

    this.logger.log('User has no campaign')
    throw new NotFoundException()
  }
}
