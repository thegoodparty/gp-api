import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const createJobResponseSchema = z.object({
  job_id: z.string(),
})

export class CreateJobResponseDto extends createZodDto(
  createJobResponseSchema,
) {} 