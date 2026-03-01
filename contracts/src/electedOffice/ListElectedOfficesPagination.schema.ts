import { z } from 'zod'
import { FilterablePaginationSchema } from '../shared/Pagination.schema'

const ELECTED_OFFICE_SORT_KEYS = [
  'id',
  'createdAt',
  'updatedAt',
  'electedDate',
  'swornInDate',
  'termStartDate',
  'termEndDate',
  'isActive',
  'userId',
  'campaignId',
] as const

export const ListElectedOfficesPaginationSchema = FilterablePaginationSchema({
  sortKeys: ELECTED_OFFICE_SORT_KEYS,
  filterFields: {
    userId: z.coerce.number().optional(),
  },
})

export type ListElectedOfficesPagination = z.infer<typeof ListElectedOfficesPaginationSchema>
