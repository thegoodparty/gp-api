import { CreateUserInputSchema } from './CreateUserInput.schema'
import { z } from 'zod'
import {
  EmailSchema,
  PhoneSchema,
  RolesSchema,
  ZipSchema,
} from 'src/shared/schemas'

export const ReadUserOutputSchema = CreateUserInputSchema.omit({
  password: true,
}).extend({
  name: z.string().nullish(),
  zip: ZipSchema.nullish(),
  phone: PhoneSchema.nullish(),
  id: z.number(),
  email: EmailSchema,
  avatar: z.string().nullish(),
  hasPassword: z.boolean(),
  roles: RolesSchema,
})

export type ReadUserOutput = z.infer<typeof ReadUserOutputSchema>
