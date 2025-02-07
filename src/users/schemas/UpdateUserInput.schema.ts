import { CreateUserInputSchema } from './CreateUserInput.schema'
import { createZodDto } from 'nestjs-zod'

export class UpdateUserInputSchema extends createZodDto(
  CreateUserInputSchema.omit({ password: true, roles: true }).partial(),
) {}
