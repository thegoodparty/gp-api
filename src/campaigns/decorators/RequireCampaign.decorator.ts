import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { UserCampaignGuard } from '../guards/UserCampaign.guard'
import { Prisma, UserRole } from '@prisma/client'

export const REQUIRE_CAMPAIGN_META_KEY = 'requireCampaignDecorator'

export type RequireCamapaignMetadata = {
  include?: Prisma.CampaignInclude
  overrideRoles?: UserRole[]
}

/**
 * Decorator to apply UserCampaign guard and preload campaign to pull in with "@UserCampaign" decorator
 * @param overrideRoles Pass array of roles to allow a user with matching role to bypass the guard
 * */
export const RequireCampaign = ({
  overrideRoles,
  include,
}: RequireCamapaignMetadata = {}) => {
  return applyDecorators(
    SetMetadata(REQUIRE_CAMPAIGN_META_KEY, { overrideRoles, include }),
    UseGuards(UserCampaignGuard),
  )
}
