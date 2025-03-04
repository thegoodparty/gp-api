import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class CreateEcanvasserDto extends createZodDto(
  z
    .object({
      apiKey: z.string().min(1),
      email: z.string().email(),
    })
    .strict(),
) {}
