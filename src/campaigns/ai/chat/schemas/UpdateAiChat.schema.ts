import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class UpdateAiChatSchema extends createZodDto(
  z.object({
    regenerate: z.boolean().optional().default(false),
    message: z.string().optional(),
  }),
) {}
