import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { passwordSchema } from '../../users/util/passwords.util'

export class ResetPasswordSchema extends createZodDto(
  z
    .object({
      email: z.string().email(),
      token: z.string(),
      password: passwordSchema,
      adminCreate: z.boolean().optional(),
    })
    .strict(),
) {}
