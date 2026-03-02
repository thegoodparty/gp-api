import validator from 'validator'
import { z } from 'zod'

export const PhoneSchema = z
  .string()
  .refine((val) => validator.isMobilePhone(val), 'Must be valid phone number')
