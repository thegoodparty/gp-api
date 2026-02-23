import { Prisma } from '@prisma/client'
import { createZodDto } from 'nestjs-zod'
import { FilterablePaginationSchema } from '@/shared/schemas/Pagination.schema'
import { z } from 'zod'

const FIELDS = Prisma.ElectedOfficeScalarFieldEnum

export class ListElectedOfficePaginationSchema extends createZodDto(
  FilterablePaginationSchema({
    sortKeys: Object.values(FIELDS),
    filterFields: {
      userId: z.coerce.number().optional(),
    },
  }),
) {}
