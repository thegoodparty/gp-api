import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { FORBIDDEN_KEYS } from './forbiddenKeys'

export class RenameAiContentSchema extends createZodDto(
  z.object({
    key: z
      .string()
      .refine((k) => !FORBIDDEN_KEYS.has(k), { message: 'Invalid key' }),
    name: z.string(),
  }),
) {}
