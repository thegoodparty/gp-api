import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'
import {
  tcrComplianceBaseShape,
  tcrComplianceSuperRefine,
  tcrComplianceTransform,
} from './tcrComplianceBase.schema'

export class SubmitToPeerlyDto extends createZodDto(
  z
    .object({
      ein: tcrComplianceBaseShape.ein,
      committeeName: tcrComplianceBaseShape.committeeName,
      filingUrl: tcrComplianceBaseShape.filingUrl,
      email: tcrComplianceBaseShape.email,
      phone: tcrComplianceBaseShape.phone,
      officeLevel: tcrComplianceBaseShape.officeLevel,
      fecCommitteeId: tcrComplianceBaseShape.fecCommitteeId,
      committeeType: tcrComplianceBaseShape.committeeType,
      websiteUrl: z.string().url(),
    })
    .superRefine(tcrComplianceSuperRefine)
    .transform(tcrComplianceTransform),
) {}
