import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class CreateSurveyDto extends createZodDto(
  z
    .object({
      name: z.string().min(1),
      description: z.string().min(1),
      requiresSignature: z.boolean().optional(),
      status: z.enum(['Live', 'Not Live']).optional(),
      teamId: z.number().int().positive().optional(),
    })
    .strict(),
) {}
