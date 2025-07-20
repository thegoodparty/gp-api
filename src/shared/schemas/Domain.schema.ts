import { z } from 'zod'
import { isFQDN } from 'validator'

export const DomainSchema = z.string().refine((v) => isFQDN(v), {
  message:
    'Invalid domain name format. Must be a root domain (e.g., example.com)',
})
