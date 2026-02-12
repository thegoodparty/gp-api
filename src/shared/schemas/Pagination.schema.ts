import { z } from 'zod'

const basePaginationSchema = z.object({
  offset: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
})

export const PaginationSchema = () => basePaginationSchema

export const SortablePaginationSchema = (sortKeys: readonly string[]) => {
  const [first, ...rest] = sortKeys
  if (!first) {
    throw new Error('sortKeys must contain at least one value')
  }
  return basePaginationSchema.extend({
    sortBy: z.enum([first, ...rest]).optional(),
  })
}

export const paginationFilter = z.string().optional()

export const FilterablePaginationSchema = <F extends z.ZodRawShape>({
  sortKeys,
  filterFields,
}: {
  sortKeys: readonly string[]
  filterFields: F
}) => SortablePaginationSchema(sortKeys).extend(filterFields)
