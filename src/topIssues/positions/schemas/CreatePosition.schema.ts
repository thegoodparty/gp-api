import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class CreatePositionSchema extends createZodDto(
  z
    .object({
      name: z.string(),
      topIssueId: z.number(),
    })
    .strict(),
) {}
