import { createZodDto } from 'nestjs-zod'
import { BriefingAdminListQuerySchema } from '@goodparty_org/contracts'

export class AdminBriefingListQueryDto extends createZodDto(
  BriefingAdminListQuerySchema,
) {}

export {
  BriefingAdminRowSchema,
  type BriefingAdminRow,
  BriefingDateRangeFilterSchema,
  type BriefingDateRangeFilter,
} from '@goodparty_org/contracts'
