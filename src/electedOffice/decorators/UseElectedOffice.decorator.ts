import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { UseElectedOfficeGuard } from '../guards/UseElectedOffice.guard'

export const REQUIRE_ELECTED_OFFICE_META_KEY = 'require_elected_office'

export type RequireElectedOfficeMetadata = {
  include?: Prisma.ElectedOfficeInclude
  continueIfNotFound?: boolean
  param?: string
}

export const UseElectedOffice = (args: RequireElectedOfficeMetadata = {}) => {
  return applyDecorators(
    SetMetadata(REQUIRE_ELECTED_OFFICE_META_KEY, args),
    UseGuards(UseElectedOfficeGuard),
  )
}
