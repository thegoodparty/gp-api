import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'
import {
  WriteEmailSchema,
  PasswordSchema,
  ZipSchema,
  PhoneSchema,
  RolesSchema,
} from 'src/shared/schemas'

export const CreateUserInputSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: WriteEmailSchema,
  password: PasswordSchema.optional(),
  name: z.string().optional(),
  zip: ZipSchema.optional(),
  phone: PhoneSchema,
  roles: RolesSchema,
})
export class CreateUserInputDto extends createZodDto(CreateUserInputSchema) {}
