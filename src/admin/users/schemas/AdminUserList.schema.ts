import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export enum DateRangeFilter {
  allTime = 'All time',
  last12Months = 'last 12 months',
  last30Days = 'last 30 days',
  lastWeek = 'last week',
}

export class AdminUserListSchema extends createZodDto(
  z.object({
    dateRange: z.nativeEnum(DateRangeFilter).optional(),
  }),
) {}
