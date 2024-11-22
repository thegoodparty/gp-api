import { isState } from 'src/shared/validations/isState'
import { z } from 'zod'

export const campaignListSchema = z.object({
  id: z.number().optional(),
  state: isState()
    .transform((val) => val.toUpperCase())
    .optional(),
  email: z.string().email().optional(),
  slug: z.string().optional(),
  level: z.enum(['LOCAL', 'CITY', 'COUNTY', 'STATE', 'FEDERAL']).optional(),
  primaryElectionDateStart: z.string().datetime().optional(),
  primaryElectionDateEnd: z.string().datetime().optional(),
  campaignStatus: z.enum(['active', 'inactive']).optional(),
  generalElectionDateStart: z.string().datetime().optional(),
  generalElectionDateEnd: z.string().datetime().optional(),
  p2vStatus: z.string().optional(),
})

export type CampaignListQuery = z.infer<typeof campaignListSchema>
