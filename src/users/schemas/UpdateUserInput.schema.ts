import { createZodDto } from 'nestjs-zod'
import { CreateUserInputSchema } from './CreateUserInput.schema'

export class UpdateUserInputSchema extends createZodDto(
  CreateUserInputSchema.omit({ password: true, roles: true }).partial(),
) {}
