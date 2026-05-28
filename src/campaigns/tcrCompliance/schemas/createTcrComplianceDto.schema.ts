import { z } from 'zod'
import { UrlOrDomainSchema } from '../../../shared/schemas'
import { createZodDto } from 'nestjs-zod'
import {
  tcrComplianceBaseShape,
  tcrComplianceSuperRefine,
  tcrComplianceTransform,
} from './tcrComplianceBase.schema'

export class CreateTcrComplianceDto extends createZodDto(
  z
    .object({
      ...tcrComplianceBaseShape,
      websiteDomain: UrlOrDomainSchema,
    })
    .superRefine(tcrComplianceSuperRefine)
    .transform(tcrComplianceTransform),
) {}
