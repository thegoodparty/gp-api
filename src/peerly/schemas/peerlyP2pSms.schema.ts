import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const createJobResponseSchema = z.object({
  id: z.string(),
  agents: z.union([z.array(z.string()), z.record(z.string())]).optional(),
  name: z.string(),
  status: z.string(),
  templates: z.array(
    z.object({
      id: z.string(),
      is_default: z.boolean().optional(),
      text: z.string().optional(),
      title: z.string().optional(),
    }),
  ),
})

export class CreateJobResponseDto extends createZodDto(
  createJobResponseSchema,
) {}
