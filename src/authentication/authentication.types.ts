import { ReadUserOutput } from '../users/schemas/ReadUserOutput.schema'
import { Campaign } from '@prisma/client'

export type LoginResult = {
  user: ReadUserOutput
  campaign: Campaign
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
