import { z } from 'zod'
import { toLowerAndTrim } from '../../shared/util/strings.util'
import { createZodDto } from 'nestjs-zod'

export const CreateUserInputSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: z
    .string()
    .email()
    .transform((v) => toLowerAndTrim(v)),
  password: z
    .string()
    .min(8, { message: 'Password must be at least 8 characters long' })
    .regex(/[a-zA-Z]/, {
      message: 'Password must contain at least one letter',
    })
    .regex(/\d/, { message: 'Password must contain at least one number' })
    .optional(),
  name: z.string().optional(),
  zip: z
    .string()
    .regex(/^\d{5}(-\d{4})?$/, { message: 'Invalid zip code format' })
    .optional(),
  phone: z
    .string()
    .regex(/^\d{10}$/, { message: 'Phone number must be exactly 10 digits' }),
})
export class CreateUserInputDto extends createZodDto(CreateUserInputSchema) {}
