import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Campaign, User } from '@prisma/client'
import { PinoLogger } from 'nestjs-pino'

import {
  REQUIRE_CAMPAIGN_META_KEY,
  RequireCampaignMetadata,
} from '../decorators/UseCampaign.decorator'
import { CampaignsService } from '../services/campaigns.service'
import { ClerkUserEnricherService } from '@/vendors/clerk/services/clerk-user-enricher.service'

const isUser = (value: object): value is User =>
  'clerkId' in value && 'email' in value

/**
 * Guard that resolves a Campaign and attaches it to the request.
 *
 * Requires the `X-Organization-Slug` header. Looks up the Organization by slug
 * and owner, then fetches the associated campaign.
 */
@Injectable()
export class UseCampaignGuard implements CanActivate {
  constructor(
    private campaignsService: CampaignsService,
    private reflector: Reflector,
    private readonly clerkEnricher: ClerkUserEnricherService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UseCampaignGuard.name)
  }

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>
      campaign?: Campaign
      user: { id: number }
    }>()

    const { continueIfNotFound, include: campaignInclude } =
      this.reflector.getAllAndOverride<RequireCampaignMetadata>(
        REQUIRE_CAMPAIGN_META_KEY,
        [context.getHandler(), context.getClass()],
      )

    const userId = request.user.id
    const include = campaignInclude ?? {}
    let campaign: Campaign | null = null

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

    if (campaign) {
      if (
        include &&
        'user' in include &&
        'user' in campaign &&
        typeof campaign.user === 'object' &&
        campaign.user !== null &&
        isUser(campaign.user)
      ) {
        const enriched = await this.clerkEnricher.enrichUser(campaign.user)
        Object.assign(campaign, { user: enriched })
      }
      request.campaign = campaign
      return true
    } else if (continueIfNotFound === true) {
      return true
    }

    this.logger.info('User has no campaign')
    throw new NotFoundException()
  }
}
