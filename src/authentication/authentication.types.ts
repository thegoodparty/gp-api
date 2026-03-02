import { type ReadUserOutput } from '@goodparty_org/contracts'
import { Campaign, User } from '@prisma/client'
import { M2MToken } from '@clerk/backend'

export type LoginResult = {
  user: ReadUserOutput
  campaign: Campaign | null
  token: string
}

export enum SocialProvider {
  GOOGLE = 'google',
  FACEBOOK = 'facebook',
}

export type SocialAuthPayload = {
  email: string
  socialToken: string
  socialPic?: string
}

export type SocialTokenValidator = (
  token: string,
  email: string,
) => Promise<string>

export interface IncomingRequest extends Request {
  headers: Headers & { authorization?: string }
  user?: User
  m2mToken?: M2MToken
}
