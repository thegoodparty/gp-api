import { createZodDto } from 'nestjs-zod'
import { FilterablePaginationSchema } from '@goodparty_org/contracts'
import { z } from 'zod'
import { Prisma } from '@prisma/client'

const FIELDS = Prisma.PathToVictoryScalarFieldEnum

export class ListPathToVictoryPaginationSchema extends createZodDto(
  FilterablePaginationSchema({
    sortKeys: Object.values(FIELDS),
    filterFields: {
      userId: z.coerce.number().optional(),
    },
  }),
) {}
