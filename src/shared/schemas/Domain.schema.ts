import { z } from 'zod'

export const DomainSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/,
    'Invalid domain name format. Must be a root domain (e.g., example.com)',
  )
