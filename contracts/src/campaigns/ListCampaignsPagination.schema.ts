import { z } from 'zod'
import {
  FilterablePaginationSchema,
  paginationFilter,
} from '../shared/Pagination.schema'
import { CAMPAIGN_SCALAR_FIELDS } from '../generated/scalarFields'

export const CAMPAIGN_SORT_KEYS = CAMPAIGN_SCALAR_FIELDS

export const ListCampaignsPaginationSchema = FilterablePaginationSchema({
  sortKeys: CAMPAIGN_SORT_KEYS,
  filterFields: {
    userId: z.coerce.number().optional(),
    slug: paginationFilter,
  },
})

export type ListCampaignsPagination = z.infer<
  typeof ListCampaignsPaginationSchema
>
