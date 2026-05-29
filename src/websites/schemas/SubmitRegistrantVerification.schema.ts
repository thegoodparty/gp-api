import { createZodDto } from 'nestjs-zod'
import { isFQDN } from 'validator'
import { z } from 'zod'

export class SubmitRegistrantVerificationBodySchema extends createZodDto(
  z.object({
    domain: z.string().refine((v) => isFQDN(v), {
      message:
        'Invalid domain format. Must be a Fully Qualified Domain Name (e.g., example.com)',
    }),
    verificationUrl: z.string().url(),
  }),
) {}

export const SubmitRegistrantVerificationResponseSchema = z.object({
  domain: z.string(),
  alreadyVerified: z.boolean(),
  registrantVerifiedAt: z.coerce.date().nullable(),
})
