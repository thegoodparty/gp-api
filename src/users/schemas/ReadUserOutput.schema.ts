import { CreateUserInputSchema } from './CreateUserInput.schema'
import { z } from 'zod'
import { ReadEmailSchema } from './Email.schema'

export const ReadUserOutputSchema = z.intersection(
  CreateUserInputSchema.omit({
    password: true,
  }),
  z.object({
    id: z.number(),
    email: ReadEmailSchema,
    avatar: z.string().nullable().optional(),
  }),
)

export type ReadUserOutput = z.infer<typeof ReadUserOutputSchema>
