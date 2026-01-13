import { createZodDto } from 'nestjs-zod'
import { CreateUserInputSchema } from '../../users/schemas/CreateUserInput.schema'

export const RegisterUserInputSchema = CreateUserInputSchema.omit({
  roles: true,
})

export class RegisterUserInputDto extends createZodDto(
  RegisterUserInputSchema,
) {}
