import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { VanityPathSchema } from './VanityPath.schema'

export class ValidateVanityPathSchema extends createZodDto(
  z.object({
    vanityPath: VanityPathSchema,
  }),
) {}
