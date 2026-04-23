import { User } from '@prisma/client'
import { VerifiedM2MToken } from '@/authentication/interfaces/auth-provider.interface'

export interface IncomingRequest extends Request {
  headers: Headers & { authorization?: string }
  user?: User & { impersonating?: boolean }
  actorUser?: User
  m2mToken?: VerifiedM2MToken
}
