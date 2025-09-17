import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { voterFilterBaseSchema } from '../../shared/schemas/voterFilterBase.schema'

export class UpdateVoterFileFilterSchema extends createZodDto(
  voterFilterBaseSchema
    .extend({
      name: z.string().min(1).optional(),
      voterCount: z.coerce.number().optional(),
    })
    .partial(),
) {}
