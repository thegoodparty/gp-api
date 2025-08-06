import { CreateUserInputSchema } from './CreateUserInput.schema'
import { z } from 'zod'
import {
  EmailSchema,
  PhoneSchema,
  RolesSchema,
  ZipSchema,
} from 'src/shared/schemas'
import { makeOptional } from 'src/shared/util/zod.util'

const WhyBrowsingSchema = z.enum(['considering', 'learning', 'test', 'else'])

const UserMetaDataSchema = z
  .object({
    customerId: z.string().optional(),
    checkoutSessionId: z.string().nullish(),
    accountType: z.string().nullish(),
    lastVisited: z.number().optional(),
    sessionCount: z.number().optional(),
    isDeleted: z.boolean().optional(),
    fsUserId: z.string().optional(),
    whyBrowsing: WhyBrowsingSchema.nullish(),
    hubspotId: z.string().optional(),
    profile_updated_count: z.number().optional(),
    textNotifications: z.boolean().optional(),
  })
  .nullish()

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
