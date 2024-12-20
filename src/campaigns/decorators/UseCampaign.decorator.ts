import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { UserCampaignGuard } from '../guards/UserCampaign.guard'
import { Prisma } from '@prisma/client'

export const REQUIRE_CAMPAIGN_META_KEY = 'requireCampaignDecorator'

export type RequireCamapaignMetadata = {
  include?: Prisma.CampaignInclude
  continueIfNotFound?: boolean
}

/**
 * Decorator to apply UserCampaign guard and preload campaign to pull in with "@ReqCampaign" decorator
 * @param continueIfNotFound Allow the handler to continue if current user doesn't have a campaign, (e.g. to deal with fallbacks in the handler)
 * @param include Object to specify what relations to load with the campaign
 * */
export const UseCampaign = (args: RequireCamapaignMetadata = {}) => {
  return applyDecorators(
    SetMetadata(REQUIRE_CAMPAIGN_META_KEY, args),
    UseGuards(UserCampaignGuard),
  )
}
