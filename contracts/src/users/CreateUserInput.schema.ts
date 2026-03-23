import { z } from 'zod'
import { EmailSchema } from '../shared/Email.schema'
import { PasswordSchema } from '../shared/Password.schema'
import { PhoneSchema } from '../shared/Phone.schema'
import { RolesSchema } from '../shared/Roles.schema'
import { ZipSchema } from '../shared/Zip.schema'

export enum SIGN_UP_MODE {
  CANDIDATE = 'candidate',
  FACILITATED = 'facilitated',
}

export const CreateUserInputSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: EmailSchema,
  password: PasswordSchema.optional(),
  name: z.string().optional(),
  zip: ZipSchema.optional(),
  phone: PhoneSchema.optional(),
  roles: RolesSchema,
  signUpMode: z
    .enum([SIGN_UP_MODE.CANDIDATE, SIGN_UP_MODE.FACILITATED])
    .optional(),
  allowTexts: z.boolean().optional(),
})

export type CreateUserInput = z.infer<typeof CreateUserInputSchema>
