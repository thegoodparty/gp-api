import { z } from 'zod'
import { UrlOrDomainSchema } from '../../../shared/schemas'
import { createZodDto } from 'nestjs-zod'
import {
  tcrComplianceBaseShape,
  tcrComplianceSuperRefine,
  tcrComplianceTransform,
} from './tcrComplianceBase.schema'

export class CreateAgenticTcrComplianceDto extends createZodDto(
  z
    .object({
      ...tcrComplianceBaseShape,
      websiteDomain: UrlOrDomainSchema.optional(),
    })
    .superRefine(tcrComplianceSuperRefine)
    .transform(tcrComplianceTransform),
) {}
