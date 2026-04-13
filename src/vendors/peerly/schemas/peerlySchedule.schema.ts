import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const createScheduleResponseSchema = z.object({
  Data: z.object({
    schedule_id: z.number(),
    schedule_name: z.string(),
    account: z.string(),
  }),
})

export class CreateScheduleResponseDto extends createZodDto(
  createScheduleResponseSchema,
) {}
