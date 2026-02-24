import { z } from 'zod'
import {
  FilterablePaginationSchema,
  paginationFilter,
} from '../shared/Pagination.schema'
import { USER_SCALAR_FIELDS } from '../generated/scalarFields'

export const USER_SORT_KEYS = USER_SCALAR_FIELDS

export const ListUsersPaginationSchema = FilterablePaginationSchema({
  sortKeys: USER_SORT_KEYS,
  filterFields: {
    firstName: paginationFilter,
    lastName: paginationFilter,
    email: paginationFilter,
  },
})

export type ListUsersPagination = z.infer<typeof ListUsersPaginationSchema>
