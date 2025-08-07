import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const createJobResponseSchema = z.object({
  agents: z.array(z.any()).optional(),
  name: z.string(),
  status: z.string(),
  templates: z.array(z.object({
    is_default: z.boolean().optional(),
    text: z.string(),
    title: z.string(),
  })),
})

export class CreateJobResponseDto extends createZodDto(
  createJobResponseSchema,
) {}
