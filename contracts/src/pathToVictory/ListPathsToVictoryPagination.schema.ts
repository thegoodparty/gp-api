import { z } from 'zod'
import {
  FilterablePaginationSchema,
  paginationFilter,
} from '../shared/Pagination.schema'

const PATH_TO_VICTORY_SORT_KEYS = [
  'id',
  'createdAt',
  'updatedAt',
  'campaignId',
] as const

export const ListPathsToVictoryPaginationSchema = FilterablePaginationSchema({
  sortKeys: PATH_TO_VICTORY_SORT_KEYS,
  filterFields: {
    userId: paginationFilter,
  },
})

export type ListPathsToVictoryPagination = z.infer<typeof ListPathsToVictoryPaginationSchema>
