import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { PasswordSchema } from './Password.schema'

export class ResetPasswordSchema extends createZodDto(
  z
    .object({
      token: z.string(),
      password: PasswordSchema,
      confirmPassword: z.string(),
    })
    .strict()
    .refine((data) => {
      return data.password === data.confirmPassword
    }, 'Password confirmation must match password'),
) {}
