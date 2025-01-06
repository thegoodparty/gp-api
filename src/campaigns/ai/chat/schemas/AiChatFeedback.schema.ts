import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { AiChatFeedbackType } from '../aiChat.types'

export class AiChatFeedbackSchema extends createZodDto(
  z.object({
    type: z.nativeEnum(AiChatFeedbackType),
    message: z.string().optional(),
  }),
) {}
