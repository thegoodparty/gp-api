import { createZodDto } from 'nestjs-zod'
import { StateSchema } from 'src/shared/schemas'
import { ElectionLevelSchema } from 'src/shared/schemas/ElectionLevel.schema'
import { z } from 'zod'

const STATUS_FILTERS = ['active', 'inactive'] as const

export class CampaignListSchema extends createZodDto(
  z.object({
    id: z.coerce.number().optional(),
    state: StateSchema()
      .transform((val) => val.toUpperCase())
      .optional(),
    email: z.string().optional(),
    slug: z.string().optional(),
    level: ElectionLevelSchema.optional(),
    primaryElectionDateStart: z.string().date().optional(),
    primaryElectionDateEnd: z.string().date().optional(),
    campaignStatus: z.enum(STATUS_FILTERS).optional(),
    generalElectionDateStart: z.string().date().optional(),
    generalElectionDateEnd: z.string().date().optional(),
    p2vStatus: z.string().optional(),
  }),
) {}
