import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class UpdateMetadataSchema extends createZodDto(
  // TODO: Once the UserMetaData TS type is fleshed out, we need
  //  to explicitly type this validation.
  z.object({
    meta: z.record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    ),
  }),
) {}
