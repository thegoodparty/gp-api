import { createZodDto } from 'nestjs-zod'
import { LEVELS } from 'src/shared/constants/governmentLevels'
import { StateSchema } from 'src/shared/schemas'
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
    level: z.enum(LEVELS).optional(),
    primaryElectionDateStart: z.string().date().optional(),
    primaryElectionDateEnd: z.string().date().optional(),
    campaignStatus: z.enum(STATUS_FILTERS).optional(),
    generalElectionDateStart: z.string().date().optional(),
    generalElectionDateEnd: z.string().date().optional(),
    p2vStatus: z.string().optional(),
  }),
) {}
