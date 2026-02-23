import { z } from 'zod'
import { CreateUserInputSchema } from './CreateUserInput.schema'
import { UserMetaDataSchema } from './UserMetaData.schema'
import { EmailSchema } from '../shared/Email.schema'
import { PhoneSchema } from '../shared/Phone.schema'
import { RolesSchema } from '../shared/Roles.schema'
import { ZipSchema } from '../shared/Zip.schema'
import { makeOptional } from '../shared/zod.util'

export const ReadUserOutputSchema = CreateUserInputSchema.omit({
  password: true,
  allowTexts: true,
}).extend({
  name: z.string().nullish(),
  zip: makeOptional(ZipSchema),
  phone: makeOptional(PhoneSchema),
  id: z.number(),
  email: EmailSchema,
  avatar: z.string().nullish(),
  hasPassword: z.boolean(),
  roles: RolesSchema,
  metaData: UserMetaDataSchema,
})

export type ReadUserOutput = z.infer<typeof ReadUserOutputSchema>
