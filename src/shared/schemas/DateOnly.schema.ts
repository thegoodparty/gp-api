import { z } from 'zod'

export const ZDateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/i, 'Expected YYYY-MM-DD')
  .transform((s) => {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d))
  })
