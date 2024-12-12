import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { passwordSchema } from '../util/passwords.util'

export class ResetPasswordSchema extends createZodDto(
  z
    .object({
      token: z.string(),
      password: passwordSchema,
      confirmPassword: z.string(),
    })
    .strict()
    .refine((data) => {
      return data.password === data.confirmPassword
    }, 'Password confirmation must match password'),
) {}
