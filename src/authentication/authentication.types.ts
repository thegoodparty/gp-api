import { ReadUserOutput } from '../users/schemas/ReadUserOutput.schema'

export type LoginResult = { user: ReadUserOutput; token: string }

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
