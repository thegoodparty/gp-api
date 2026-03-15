import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class SyncProfileSchema extends createZodDto(
  z.object({
    phone: z.string().optional(),
    zip: z.string().optional(),
  }),
) {}
