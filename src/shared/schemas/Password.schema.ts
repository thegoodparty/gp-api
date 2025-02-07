import { z } from 'zod'

export const PasswordSchema = z
  .string()
  .min(8, { message: 'Password must be at least 8 characters long' })
  .regex(/[a-zA-Z]/, {
    message: 'Password must contain at least one letter',
  })
  .regex(/\d/, { message: 'Password must contain at least one number' })
