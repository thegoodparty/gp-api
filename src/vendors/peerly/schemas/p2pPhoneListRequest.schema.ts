import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { voterFilterBaseSchema } from '../../../shared/schemas/voterFilterBase.schema'

export class P2pPhoneListRequestSchema extends createZodDto(
  voterFilterBaseSchema.extend({
    name: z.string().min(1),
  }),
) {}
