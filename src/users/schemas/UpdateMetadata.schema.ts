import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { UserMetaDataObjectSchema } from './UserMetaData.schema'

export class UpdateMetadataSchema extends createZodDto(
  z.object({
    meta: UserMetaDataObjectSchema,
  }),
) {}
