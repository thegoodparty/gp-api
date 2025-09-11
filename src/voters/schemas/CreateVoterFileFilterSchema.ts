import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { voterFilterBaseSchema } from '../../shared/schemas/voterFilterBase.schema'

export class CreateVoterFileFilterSchema extends createZodDto(
  voterFilterBaseSchema.extend({
    name: z.string().min(1),
    voterCount: z.coerce.number().optional().default(0),
  }),
) {}
