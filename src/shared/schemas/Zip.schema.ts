import { isPostalCode } from 'validator'
import { z } from 'zod'

export const ZipSchema = z
  .string()
  .refine((val) => isPostalCode(val, 'US'), 'Must be valid Zip code')
