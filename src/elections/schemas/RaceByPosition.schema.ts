import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class RaceByPositionSchema extends createZodDto(
  z.object({
    brPositionId: z.string().min(1),
    electionDate: z.string().date(),
  }),
) {}
