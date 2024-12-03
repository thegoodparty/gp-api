import { createZodDto } from 'nestjs-zod'
import { CreateUserInputSchema } from './CreateUserInput.schema'
import { User } from '@prisma/client'

export const ReadUserOutputSchema = CreateUserInputSchema.omit({
  password: true,
})

// TODO: Find a more explicit pattern for excluding fields
export class ReadUserOutputDTO extends createZodDto(ReadUserOutputSchema) {
  constructor(data?: User) {
    super()
    const { password: _excludedPassword, ...included } = data || {}
    return data
      ? {
          ...this,
          ...included,
        }
      : this
  }
}
