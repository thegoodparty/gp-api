import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class UpdateSurveyDto extends createZodDto(
  z
    .object({
      name: z.string().min(1),
      status: z.enum(['Live', 'Not Live']),
    })
    .strict(),
) {}
