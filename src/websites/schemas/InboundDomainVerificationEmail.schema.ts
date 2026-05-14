import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export const InboundDomainVerificationEmailZ = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  subject: z.string().default(''),
  text: z.string().default(''),
  html: z.string().default(''),
})

export class InboundDomainVerificationEmailSchema extends createZodDto(
  InboundDomainVerificationEmailZ,
) {}
