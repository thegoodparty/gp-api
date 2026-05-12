import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export class RenameAiContentSchema extends createZodDto(
  z.object({
    key: z
      .string()
      .refine((k) => !FORBIDDEN_KEYS.has(k), { message: 'Invalid key' }),
    name: z.string(),
  }),
) {}
