import { CreateUserInputSchema } from './CreateUserInput.schema'
import { z } from 'zod'

export const ReadUserOutputSchema = CreateUserInputSchema.omit({
  password: true,
})

export type ReadUserOutput = z.infer<typeof ReadUserOutputSchema>
