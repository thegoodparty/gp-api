import { createZodDto } from 'nestjs-zod'
import { ZDateOnly } from 'src/shared/schemas/DateOnly.schema'
import { z } from 'zod'

export const MAX_POLL_MESSAGE_LENGTH = 1700

export class CreatePollDto extends createZodDto(
  z.object({
    message: z
      .string()
      .min(1, 'Message is required')
      .max(
        MAX_POLL_MESSAGE_LENGTH,
        `Message must be less than ${MAX_POLL_MESSAGE_LENGTH} characters`,
      ),
    swornInDate: ZDateOnly,
    imageUrl: z.string().url().optional().nullable(),
    scheduledDate: z.string().datetime().optional(),
  }),
) {}
