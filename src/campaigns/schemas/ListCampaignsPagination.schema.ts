import { Prisma } from '@prisma/client'
import { createZodDto } from 'nestjs-zod'
import {
  FilterablePaginationSchema,
  paginationFilter,
} from '@/shared/schemas/Pagination.schema'
import { z } from 'zod'

const FIELDS = Prisma.CampaignScalarFieldEnum

export class ListCampaignsPaginationSchema extends createZodDto(
  FilterablePaginationSchema({
    sortKeys: Object.values(FIELDS),
    filterFields: {
      userId: z.coerce.number().optional(),
      slug: paginationFilter,
    },
  }),
) {}
