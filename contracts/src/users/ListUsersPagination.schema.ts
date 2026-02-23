import { z } from 'zod'
import {
  FilterablePaginationSchema,
  paginationFilter,
} from '../shared/Pagination.schema'

export const USER_SORT_KEYS = [
  'id',
  'createdAt',
  'updatedAt',
  'firstName',
  'lastName',
  'name',
  'avatar',
  'password',
  'hasPassword',
  'email',
  'phone',
  'zip',
  'roles',
  'metaData',
  'passwordResetToken',
] as const

export const ListUsersPaginationSchema = FilterablePaginationSchema({
  sortKeys: USER_SORT_KEYS,
  filterFields: {
    firstName: paginationFilter,
    lastName: paginationFilter,
    email: paginationFilter,
  },
})

export type ListUsersPagination = z.infer<typeof ListUsersPaginationSchema>
