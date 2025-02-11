import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { PhoneSchema, WriteEmailSchema, ZipSchema } from 'src/shared/schemas'

export class AdminCreateCampaignSchema extends createZodDto(
  z
    .object({
      firstName: z.string(),
      lastName: z.string(),
      phone: PhoneSchema,
      email: WriteEmailSchema,
      zip: ZipSchema,
      party: z.string(),
      otherParty: z.string().optional(),
    })
    .strict(),
) {}
