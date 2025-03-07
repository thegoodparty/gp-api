import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class UpdateEcanvasserDto extends createZodDto(
  z
    .object({
      apiKey: z.string().min(1).optional(),
    })
    .strict(),
) {}
