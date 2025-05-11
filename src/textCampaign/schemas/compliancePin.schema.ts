import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class CompliancePinSchema extends createZodDto(
  z.object({
    pin: z.string(),
  }),
) {}
