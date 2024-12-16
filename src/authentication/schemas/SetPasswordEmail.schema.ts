import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class SetPasswordEmailSchema extends createZodDto(
  z.object({ userId: z.number() }).strict(),
) {}
