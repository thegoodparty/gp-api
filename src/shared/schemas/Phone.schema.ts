import { isMobilePhone } from 'validator'
import { z } from 'zod'

export const PhoneSchema = z
  .string()
  .refine((val) => isMobilePhone(val, 'en-US'), 'Must be valid phone number')
