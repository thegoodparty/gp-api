import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'
import {
  PasswordSchema,
  PhoneSchema,
  RolesSchema,
  WriteEmailSchema,
  ZipSchema,
} from 'src/shared/schemas'

export enum SIGN_UP_MODE {
  CANDIDATE = 'candidate',
  FACILITATED = 'facilitated',
}

export const CreateUserInputSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: WriteEmailSchema,
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
export class CreateUserInputDto extends createZodDto(CreateUserInputSchema) {}
