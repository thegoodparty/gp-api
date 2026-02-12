import { Prisma } from '@prisma/client'
import { createZodDto } from 'nestjs-zod'
import {
  FilterablePaginationSchema,
  paginationFilter,
} from '@/shared/schemas/Pagination.schema'

const FIELDS = Prisma.UserScalarFieldEnum

export class ListUsersPaginationSchema extends createZodDto(
  FilterablePaginationSchema({
    sortKeys: Object.values(FIELDS),
    filterFields: {
      firstName: paginationFilter,
      lastName: paginationFilter,
      email: paginationFilter,
    },
  }),
) {}
