import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class GetSystemPromptSchema extends createZodDto(
  z.object({
    slug: z.string(),
    initial: z.boolean().optional(),
  }),
) {}
