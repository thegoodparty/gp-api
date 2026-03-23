import { z } from 'zod'
import { PasswordSchema } from '../shared/Password.schema'

export const UpdatePasswordSchema = z
  .object({
    oldPassword: PasswordSchema.optional(),
    newPassword: PasswordSchema,
  })
  .strict()

export type UpdatePasswordInput = z.infer<typeof UpdatePasswordSchema>
