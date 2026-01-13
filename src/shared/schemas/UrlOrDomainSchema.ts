import { isURL } from 'validator'
import { z } from 'zod'

export const UrlOrDomainSchema = z
  .string()
  .refine((v) => isURL(v, { require_protocol: false }), {
    message:
      'Invalid website address format. Must be either a URL or a domain name (e.g., https://example.com or example.com)',
  })
