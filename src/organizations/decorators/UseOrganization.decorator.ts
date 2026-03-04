import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { UseOrganizationGuard } from '../guards/UseOrganization.guard'

export const REQUIRE_ORGANIZATION_META_KEY = 'requireOrganizationDecorator'

export type RequireOrganizationMetadata = {
  include?: Prisma.OrganizationInclude
  continueIfNotFound?: boolean
  fallback?: 'campaign' | 'elected-office'
}

/**
 * Decorator to apply UseOrganization guard and preload organization
 * to pull in with "@ReqOrganization" decorator.
 *
 * Reads the organization slug from the `X-Organization-Slug` request header.
 * If the header is absent, falls back to deriving the slug from the user's
 * campaign or elected office (when `fallback` is specified).
 */
export const UseOrganization = (args: RequireOrganizationMetadata = {}) => {
  return applyDecorators(
    SetMetadata(REQUIRE_ORGANIZATION_META_KEY, args),
    UseGuards(UseOrganizationGuard),
  )
}
