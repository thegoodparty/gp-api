import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { UserMetaDataObjectSchema } from '@goodparty_org/contracts'

export class UpdateMetadataSchema extends createZodDto(
  z.object({
    meta: UserMetaDataObjectSchema,
  }),
) {}
