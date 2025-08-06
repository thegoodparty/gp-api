import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const createMediaResponseSchema = z.object({
  media_id: z.string(),
  status: z.string().optional(),
  error: z.string().optional(),
})

export class CreateMediaResponseDto extends createZodDto(
  createMediaResponseSchema,
) {} 