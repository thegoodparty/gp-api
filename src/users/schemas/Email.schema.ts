import { z } from 'zod'
import { toLowerAndTrim } from '../../shared/util/strings.util'

export const WriteEmailSchema = z
  .string()
  .email()
  .transform((v) => toLowerAndTrim(v).replace('%2b', '+'))

export const ReadEmailSchema = z.string().email()
