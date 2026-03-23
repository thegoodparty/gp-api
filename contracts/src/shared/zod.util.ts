import { z } from 'zod'

export const makeOptional = <T>(schema: z.ZodType<T>) =>
  z.union([z.null(), z.undefined(), z.literal(''), schema])
