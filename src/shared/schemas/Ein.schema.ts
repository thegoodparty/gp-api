import { z } from 'zod'

export const EinSchema = z.string().regex(/^\d{2}-\d{7}$/, {
  message: 'EIN must be in format XX-XXXXXXX',
})
