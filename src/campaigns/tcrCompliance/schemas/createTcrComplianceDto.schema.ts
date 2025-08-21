import { z } from 'zod'
import {
  DomainSchema,
  EinSchema,
  PhoneSchema,
  WriteEmailSchema,
} from '../../../shared/schemas'
import { createZodDto } from 'nestjs-zod'
import { MatchingContactFieldType } from '@prisma/client'

const FILING_URL_PATTERN = new RegExp(/https?:\/\/(.+.)?fec.gov(.+)?/i)

export class CreateTcrComplianceDto extends createZodDto(
  z.object({
    ein: EinSchema,
    placeId: z.string(),
    formattedAddress: z.string(),
    committeeName: z.string(),
    websiteDomain: DomainSchema,
    filingUrl: z.string().url().regex(FILING_URL_PATTERN),
    email: WriteEmailSchema,
    phone: PhoneSchema,
    matchingContactFields: z.array(z.nativeEnum(MatchingContactFieldType)),
  }),
) {}
