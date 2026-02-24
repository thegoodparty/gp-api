import { z } from 'zod'
import { CreateUserInputSchema } from './CreateUserInput.schema'
import { UserMetaDataSchema } from './UserMetaData.schema'

export const UpdateUserInputSchema = CreateUserInputSchema.omit({
  password: true,
}).partial().extend({
  metaData: UserMetaDataSchema,
})

export type UpdateUserInput = z.infer<typeof UpdateUserInputSchema>
