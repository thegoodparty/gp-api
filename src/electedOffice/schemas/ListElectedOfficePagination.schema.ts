import { Prisma } from '@prisma/client'
import { createZodDto } from 'nestjs-zod'
import { FilterablePaginationSchema } from '@goodparty_org/contracts'
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
