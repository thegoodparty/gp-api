import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'
import { WriteEmailSchema } from './Email.schema'
import { PasswordSchema } from './Password.schema'
import { RolesSchema } from './Roles.schema'

export const CreateUserInputSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: WriteEmailSchema,
  password: PasswordSchema,
  name: z.string().optional(),
  zip: z
    .string()
    .regex(/^\d{5}(-\d{4})?$/, { message: 'Invalid zip code format' })
    .optional(),
  phone: z
    .string()
    .regex(/^\d{10}$/, { message: 'Phone number must be exactly 10 digits' }),
  roles: RolesSchema,
})
export class CreateUserInputDto extends createZodDto(CreateUserInputSchema) {}
