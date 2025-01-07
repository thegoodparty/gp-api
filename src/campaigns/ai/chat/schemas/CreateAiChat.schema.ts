import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class CreateAiChatSchema extends createZodDto(
  z.object({
    message: z.string(),
    initial: z.boolean().optional().default(false),
  }),
) {}
