import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class UpdatePositionSchema extends createZodDto(
  z
    .object({
      name: z.string(),
    })
    .strict(),
) {}
