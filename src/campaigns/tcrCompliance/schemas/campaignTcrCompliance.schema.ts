import { z } from 'zod'
import {
  EIN_PATTERN_FULL,
  WEB_DOMAIN_PATTERN,
} from '../campaignTcrCompliance.consts'

export const CreateTcrComplianceDto = z.object({
  ein: z.string().regex(EIN_PATTERN_FULL),
  address: z.string(),
  committeeName: z.string(),
  websiteDomain: z.string().regex(WEB_DOMAIN_PATTERN),
  filingUrl: z.string().url(),
  email: z.string().email(),
})

export type CreateTcrComplianceDto = z.infer<typeof CreateTcrComplianceDto>
