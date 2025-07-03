import { z } from 'zod'

export const VanityPathSchema = z
  .string()
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, {
    message:
      'Vanity path must contain only lowercase letters, numbers, and hyphens. It cannot start or end with a hyphen.',
  })
  .transform((val) => val?.toLowerCase())
  .optional()
