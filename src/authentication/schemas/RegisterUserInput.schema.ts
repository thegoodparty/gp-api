import { CreateUserInputSchema } from '../../users/schemas/CreateUserInput.schema'
import { createZodDto } from 'nestjs-zod'

export const RegisterUserInputSchema = CreateUserInputSchema.omit({
  roles: true,
})

export class RegisterUserInputDto extends createZodDto(
  RegisterUserInputSchema,
) {}
