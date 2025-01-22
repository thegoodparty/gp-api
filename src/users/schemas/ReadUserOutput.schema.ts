import { CreateUserInputSchema } from './CreateUserInput.schema'
import { z } from 'zod'
import { ReadEmailSchema } from './Email.schema'

export const ReadUserOutputSchema = CreateUserInputSchema.omit({
  password: true,
}).extend({
  zip: CreateUserInputSchema.shape.zip.nullish(),
  phone: CreateUserInputSchema.shape.phone.nullish(),
  id: z.number(),
  email: ReadEmailSchema,
  avatar: z.string().nullish(),
})

export type ReadUserOutput = z.infer<typeof ReadUserOutputSchema>
