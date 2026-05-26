import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export const SEND_MESSAGE_MAX_LENGTH = 10_000

export const sendMessageSchema = z.object({
  content: z
    .string()
    .min(1)
    .max(SEND_MESSAGE_MAX_LENGTH)
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, { message: 'content must not be empty' }),
  clientMessageId: z.string().uuid().optional(),
})

export class SendMessageSchema extends createZodDto(sendMessageSchema) {}
