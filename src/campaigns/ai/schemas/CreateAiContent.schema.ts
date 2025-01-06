import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class CreateAiContentSchema extends createZodDto(
  z.object({
    key: z.string(),
    regenerate: z.boolean().optional(),
    editMode: z.boolean().optional(),
    // TODO: more exact types for the below inputs
    inputValues: z
      .record(z.string(), z.union([z.string(), z.boolean(), z.number()]))
      .optional(),
    chat: z
      .array(z.record(z.string(), z.union([z.string(), z.number()])))
      .optional(),
  }),
) {}
