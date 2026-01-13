import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  EinSchema,
  PhoneSchema,
  UrlOrDomainSchema,
  WriteEmailSchema,
} from '../../../shared/schemas'
import { urlIncludesPath } from '../../../shared/util/strings.util'

export class CreateTcrComplianceDto extends createZodDto(
  z.object({
    ein: EinSchema,
    placeId: z.string(),
    formattedAddress: z.string(),
    committeeName: z.string(),
    websiteDomain: UrlOrDomainSchema,
    filingUrl: UrlOrDomainSchema.refine(urlIncludesPath, {
      message:
        'Filing URL must include path (e.g. https://example.com/filing, not just https://example.com)',
    }),
    email: WriteEmailSchema,
    phone: PhoneSchema,
  }),
) {}
