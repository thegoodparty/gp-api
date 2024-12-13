import { createZodDto } from 'nestjs-zod'
import { PasswordSchema } from 'src/users/schemas/Password.schema'
import { z } from 'zod'

export class ResetPasswordSchema extends createZodDto(
  z
    .object({
      email: z.string().email(),
      token: z.string(),
      password: PasswordSchema,
      adminCreate: z.boolean().optional(),
    })
    .strict(),
) {}
