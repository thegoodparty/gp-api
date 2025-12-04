import { createZodDto } from 'nestjs-zod'
import { ZDateOnly } from 'src/shared/schemas/DateOnly.schema'
import { z } from 'zod'
export class CreatePollDto extends createZodDto(
  z.object({
    message: z.string().min(1, 'Message is required'),
    swornInDate: ZDateOnly,
    imageUrl: z.string().url().optional().nullable(),
  }),
) {}
