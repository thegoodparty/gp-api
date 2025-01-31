import { z } from 'zod'
import { toLowerAndTrim } from '../util/strings.util'

export const EmailSchema = z.string().email()

/** Schema for accepting email input value */
export const WriteEmailSchema = EmailSchema.transform((v) =>
  toLowerAndTrim(v).replace('%2b', '+'),
)
