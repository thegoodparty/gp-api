import { z, ZodSchema } from 'zod'
import { PaginationMetaSchema } from '@goodparty_org/contracts'

export const PaginatedResponseSchema = <T extends ZodSchema>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    meta: PaginationMetaSchema,
  })
