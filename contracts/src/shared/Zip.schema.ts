import validator from 'validator'
import { z } from 'zod'

export const ZipSchema = z
  .string()
  .refine((val) => validator.isPostalCode(val, 'US'), 'Must be valid Zip code')
