import { createZodDto } from 'nestjs-zod'
import { ZipSchema } from '@goodparty_org/contracts'
import { z } from 'zod'

export class RaceByPositionSchema extends createZodDto(
  z.object({
    brPositionId: z.string().min(1),
    zip: ZipSchema,
    electionDate: z.string().date(),
  }),
) {}
