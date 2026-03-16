import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class SyncProfileSchema extends createZodDto(
  z.object({
    phone: z.string().max(15).optional(),
    zip: z.string().max(10).optional(),
  }),
) {}
