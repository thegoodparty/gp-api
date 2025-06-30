import { z } from 'zod'

export const PaginationSchema = <T extends [string, ...string[]]>(
  sortKeys: T,
) =>
  z.object({
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
    sortBy: z.enum(sortKeys).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  })
