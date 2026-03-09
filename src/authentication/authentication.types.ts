import { User } from '@prisma/client'
import { M2MToken } from '@clerk/backend'

export interface IncomingRequest extends Request {
  headers: Headers & { authorization?: string }
  user?: User
  m2mToken?: M2MToken
}
