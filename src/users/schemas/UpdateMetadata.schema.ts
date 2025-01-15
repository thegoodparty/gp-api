import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class UpdateMetadataSchema extends createZodDto(
  z.object({
    meta: z.record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    ),
  }),
) {}
