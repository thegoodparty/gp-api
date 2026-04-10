import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { UseOrganizationGuard } from '../guards/UseOrganization.guard'

export const REQUIRE_ORGANIZATION_META_KEY = 'requireOrganizationDecorator'

export type RequireOrganizationMetadata = {
  continueIfNotFound?: boolean
}

/**
 * Decorator to apply UseOrganization guard and preload organization
 * to pull in with "@ReqOrganization" decorator.
 *
 * Reads the organization slug from the `X-Organization-Slug` request header.
 * Used when you need Organization data directly (positionId, overrideDistrictId, etc.).
 *
 * For ElectedOffice or Campaign resolution, use @UseElectedOffice() or @UseCampaign()
 * instead — those guards also resolve via the `X-Organization-Slug` header.
 */
export const UseOrganization = (args: RequireOrganizationMetadata = {}) => {
  return applyDecorators(
    SetMetadata(REQUIRE_ORGANIZATION_META_KEY, args),
    UseGuards(UseOrganizationGuard),
  )
}
