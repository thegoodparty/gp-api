import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { isMobilePhone, isPostalCode } from 'validator'

import { PasswordSchema } from '../../../users/schemas/Password.schema'

export class AdminCreateCampaignSchema extends createZodDto(
  z
    .object({
      firstName: z.string(),
      lastName: z.string(),
      phone: z.string().refine((value) => isMobilePhone(value, 'en-US')),
      email: z.string().email('Must be a valid email'),
      password: PasswordSchema,
      zip: z.string().refine((value) => isPostalCode(value, 'US')),
      party: z.string(),
      otherParty: z.string().optional(),
    })
    .strict(),
) {}
