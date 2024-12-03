import { z } from 'zod'
import { toLowerAndTrim } from '../../shared/util/strings.util'

export const LoginPayloadSchema = z.object({
  email: z
    .string()
    .email()
    .transform((v) => toLowerAndTrim(v)),
  password: z
    .string()
    .min(8, { message: 'Password must be at least 8 characters long' })
    .regex(/[a-zA-Z]/, { message: 'Password must contain at least one letter' })
    .regex(/\d/, { message: 'Password must contain at least one number' })
    .optional(),
})

export type LoginRequestPayload = z.infer<typeof LoginPayloadSchema>
