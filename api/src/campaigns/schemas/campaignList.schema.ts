import { LEVELS } from 'src/shared/constants/governmentLevels'
import { isState } from 'src/shared/validations/isState'
import { z } from 'zod'

const STATUS_FILTERS = ['active', 'inactive'] as const

export const campaignListSchema = z.object({
  id: z.coerce.number().optional(),
  state: isState()
    .transform((val) => val.toUpperCase())
    .optional(),
  email: z.string().email().optional(),
  slug: z.string().optional(),
  level: z.enum(LEVELS).optional(),
  primaryElectionDateStart: z.string().date().optional(),
  primaryElectionDateEnd: z.string().date().optional(),
  campaignStatus: z.enum(STATUS_FILTERS).optional(),
  generalElectionDateStart: z.string().date().optional(),
  generalElectionDateEnd: z.string().date().optional(),
  p2vStatus: z.string().optional(),
})

export type CampaignListQuery = z.infer<typeof campaignListSchema>
