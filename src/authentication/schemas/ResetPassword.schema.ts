import { createZodDto } from 'nestjs-zod'
import { PasswordSchema, WriteEmailSchema } from 'src/shared/schemas'
import { z } from 'zod'

export class ResetPasswordSchema extends createZodDto(
  z
    .object({
      email: WriteEmailSchema,
      token: z.string(),
      password: PasswordSchema,
      adminCreate: z.boolean().optional(),
    })
    .strict(),
) {}
