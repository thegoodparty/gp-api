import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class UpdateEcanvasserSchema extends createZodDto(
  z
    .object({
      apiKey: z.string().min(1).optional(),
    })
    .strict(),
) {}
