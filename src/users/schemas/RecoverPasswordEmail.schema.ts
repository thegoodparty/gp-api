import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class RecoverPasswordSchema extends createZodDto(
  z.object({
    email: z.string().email(),
  }),
) {}
