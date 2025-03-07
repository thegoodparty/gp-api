import { Strategy } from 'passport-custom'
import { AuthenticationService } from '../services/authentication.service'
import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { SocialAuthPayload, SocialProvider } from '../authentication.types'
import { User } from '@prisma/client'

export const SOCIAL_LOGIN_STRATEGY_NAME = 'social'

type SocialLoginRequestWithParams = Request & {
  params: { socialProvider: SocialProvider }
}

@Injectable()
export class SocialLoginStrategy extends PassportStrategy(
  Strategy,
  SOCIAL_LOGIN_STRATEGY_NAME,
) {
  name = SOCIAL_LOGIN_STRATEGY_NAME
  constructor(private readonly authService: AuthenticationService) {
    super()
  }

  async validate(req: SocialLoginRequestWithParams): Promise<User> {
    const { socialProvider } = req.params
    // TODO: figure out how to properly type req.body in a PassportStrategy so as to
    // avoid using `unknown` and `as` casts
    const socialAuthPayload = req.body as unknown as SocialAuthPayload
    return this.authService.socialUserValidation(
      socialAuthPayload,
      socialProvider,
    )
  }
}
