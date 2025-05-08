import { createZodDto } from 'nestjs-zod'
import { EinSchema, WriteEmailSchema } from 'src/shared/schemas'
import { z } from 'zod'

export class ComplianceFormSchema extends createZodDto(
  z.object({
    ein: EinSchema,
    address: z.string(),
    name: z.string(),
    website: z.string().url(),
    email: WriteEmailSchema,
  }),
) {}
