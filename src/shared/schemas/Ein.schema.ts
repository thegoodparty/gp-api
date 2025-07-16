import { z } from 'zod'

const EIN_PATTERN_FULL = /^\d{2}-\d{7}$/

export const EinSchema = z.string().regex(EIN_PATTERN_FULL, {
  message: 'EIN must be in format XX-XXXXXXX',
})
