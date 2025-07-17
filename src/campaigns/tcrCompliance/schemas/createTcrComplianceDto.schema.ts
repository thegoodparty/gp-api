import { z } from 'zod'
import {
  DomainSchema,
  EinSchema,
  PhoneSchema,
  WriteEmailSchema,
} from '../../../shared/schemas'
import { PostalAddressSchema } from '../../../shared/schemas/PostalAddress.schema'
import { createZodDto } from 'nestjs-zod'

export class CreateTcrComplianceDto extends createZodDto(
  z.object({
    ein: EinSchema,
    postalAddress: PostalAddressSchema.required(),
    committeeName: z.string(),
    websiteDomain: DomainSchema,
    filingUrl: z.string().url(),
    email: WriteEmailSchema,
    phone: PhoneSchema,
  }),
) {}
