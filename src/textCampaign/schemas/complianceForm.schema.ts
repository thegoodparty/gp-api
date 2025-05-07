import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class ComplianceFormSchema extends createZodDto(
  z.object({
    ein: z.string(),
    address: z.string(),
    name: z.string(),
    website: z.string().url(),
    email: z.string().email(),
  }),
) {}
