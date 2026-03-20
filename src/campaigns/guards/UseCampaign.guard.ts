import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Campaign } from '@prisma/client'
import { PinoLogger } from 'nestjs-pino'
import { CampaignWith } from '../campaigns.types'
import {
  REQUIRE_CAMPAIGN_META_KEY,
  RequireCamapaignMetadata,
} from '../decorators/UseCampaign.decorator'
import { CampaignsService } from '../services/campaigns.service'

/**
 * Guard that resolves a Campaign and attaches it to the request.
 *
 * Resolution order:
 * 1. `X-Organization-Slug` header — look up Organization, get its campaign.
 * 2. Legacy fallback — find campaign by userId.
 *
 * Once all requests include the organization header, the legacy fallback can be removed.
 */
@Injectable()
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
      headers: Record<string, string | undefined>
      params: { slug: string }
      campaign?: Campaign
      user: { id: number }
    }>()

    const { continueIfNotFound, include: campaignInclude } =
      this.reflector.getAllAndOverride<RequireCamapaignMetadata>(
        REQUIRE_CAMPAIGN_META_KEY,
        [context.getHandler(), context.getClass()],
      )

    const userId = request.user.id
    const include = campaignInclude ?? { pathToVictory: true }
    let campaign: Campaign | null = null

    // Step 1: Try x-organization-slug header
    const slug = request.headers['x-organization-slug']
    if (typeof slug === 'string') {
      const [org, cam] = await Promise.all([
        this.campaignsService.client.organization.findFirst({
          where: { slug, ownerId: userId },
        }),
        this.campaignsService.findFirst({
          where: { organizationSlug: slug, userId },
          include,
        }),
      ])
      if (org && cam) {
        campaign = cam
      }
    }

    // Step 2: Legacy fallback — find by userId
    if (!campaign) {
      campaign = await this.campaignsService.findByUserId(userId, include)
    }

    if (campaign) {
      // Prisma include query — TypeScript cannot narrow the included relations at compile time
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      request.campaign = campaign as CampaignWith<'pathToVictory'>
      return true
    } else if (continueIfNotFound === true) {
      return true
    }

    this.logger.info('User has no campaign')
    throw new NotFoundException()
  }
}
