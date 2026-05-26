import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { UserMetaDataObjectSchema } from '@goodparty_org/contracts'

const UserWritableMetaDataSchema = UserMetaDataObjectSchema.omit({
  customerId: true,
  checkoutSessionId: true,
})

export class UpdateMetadataSchema extends createZodDto(
  z.object({
    meta: UserWritableMetaDataSchema,
  }),
) {}
