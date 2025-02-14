import { createZodDto } from 'nestjs-zod'
import { LEVELS } from 'src/shared/constants/governmentLevels'
import { ZipSchema } from 'src/shared/schemas'
import { z } from 'zod'

export class RacesByYearSchema extends createZodDto(
  z.object({
    zipcode: ZipSchema,
    level: z.enum(LEVELS).optional(),
    electionDate: z.string().date().optional(),
  }),
) {}
