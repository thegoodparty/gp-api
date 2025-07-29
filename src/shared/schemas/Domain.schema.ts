import { z } from 'zod'
import { isFQDN, isURL } from 'validator'

export const DomainSchema = z.string().refine((v) => isFQDN(v) || isURL(v), {
  message:
    'Invalid website address format. Must be either a URL or a domain name (e.g., https://example.com or example.com)',
})
