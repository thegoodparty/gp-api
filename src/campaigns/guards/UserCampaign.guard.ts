import {
  Injectable,
  CanActivate,
  Logger,
  ExecutionContext,
  NotFoundException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { CampaignsService } from '../services/campaigns.service'
import {
  REQUIRE_CAMPAIGN_META_KEY,
  RequireCamapaignMetadata,
} from '../decorators/UseCampaign.decorator'

@Injectable()
/**
 * Restrict an endpoint to require user to have a campaign
 * Do not need to apply this directly, use the "@RequireCampaign" decorator
 * */
export class UserCampaignGuard implements CanActivate {
  private readonly logger = new Logger(UserCampaignGuard.name)

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
    const campaign = await this.campaignsService.findByUser(
      request.user.id,
      campaignInclude ?? { pathToVictory: true }, // default to include path to victory
    )

    if (campaign) {
      // store on request to access with @UserCampaign decorator
      request.campaign = campaign
      return true
    } else if (continueIfNotFound === true) {
      // if continueIfNotFound, allow request handler to continue
      return true
    }

    this.logger.log('User has no campaign')
    throw new NotFoundException()
  }
}
