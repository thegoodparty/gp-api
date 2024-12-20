import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class UpdateAiChatSchema extends createZodDto(
  z.object({
    threadId: z.string(),
    regenerate: z.boolean().optional().default(false),
    message: z.string().optional(),
  }),
) {}
