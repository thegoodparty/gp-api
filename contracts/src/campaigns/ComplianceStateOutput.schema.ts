import { z } from 'zod'
import { ComplianceStageSchema } from './enums'
import { DomainStatusSchema } from '../generated/enums'

export const ComplianceStateDomainSchema = z.object({
  name: z.string(),
  status: DomainStatusSchema,
  registrantVerifiedAt: z.string().datetime({ offset: true }).nullable(),
})

export type ComplianceStateDomain = z.infer<typeof ComplianceStateDomainSchema>

export const ComplianceStateOutputSchema = z.object({
  stage: ComplianceStageSchema,
  domain: ComplianceStateDomainSchema.nullable(),
  websiteId: z.number().int().nullable(),
  peerlyVerificationId: z.string().nullable(),
})

export type ComplianceStateOutput = z.infer<typeof ComplianceStateOutputSchema>
