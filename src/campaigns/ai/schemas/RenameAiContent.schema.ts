import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class RenameAiContentSchema extends createZodDto(
  z.object({
    key: z.string(),
    name: z.string(),
  }),
) {}
