import { createZodDto } from 'nestjs-zod'
import { PhoneSchema, WriteEmailSchema, ZipSchema } from 'src/shared/schemas'
import { z } from 'zod'

export class AdminCreateCampaignSchema extends createZodDto(
  z
    .object({
      firstName: z.string(),
      lastName: z.string(),
      phone: PhoneSchema,
      email: WriteEmailSchema,
      zip: ZipSchema,
      party: z.string(),
      adminUserEmail: z.string(),
      otherParty: z.string().optional(),
    })
    .strict(),
) {}
