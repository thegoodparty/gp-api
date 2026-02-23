import { isMobilePhone } from 'validator'
import { z } from 'zod'

export const PhoneSchema = z
  .string()
  .refine((val) => isMobilePhone(val), 'Must be valid phone number')
