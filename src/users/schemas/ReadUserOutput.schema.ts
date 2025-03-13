import { CreateUserInputSchema } from './CreateUserInput.schema'
import { z } from 'zod'
import {
  EmailSchema,
  PhoneSchema,
  RolesSchema,
  ZipSchema,
} from 'src/shared/schemas'
import { makeOptional } from 'src/shared/util/zod.util'

export const ReadUserOutputSchema = CreateUserInputSchema.omit({
  password: true,
}).extend({
  name: z.string().nullish(),
  zip: makeOptional(ZipSchema),
  phone: makeOptional(PhoneSchema),
  id: z.number(),
  email: EmailSchema,
  avatar: z.string().nullish(),
  hasPassword: z.boolean(),
  roles: RolesSchema,
})

export type ReadUserOutput = z.infer<typeof ReadUserOutputSchema>
