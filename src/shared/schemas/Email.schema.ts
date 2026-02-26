import { EmailSchema } from '@goodparty_org/contracts'
import { toLowerAndTrim } from '../util/strings.util'

/** Schema for accepting email input value */
export const WriteEmailSchema = EmailSchema.transform((v) =>
  toLowerAndTrim(v).replace('%2b', '+'),
)
