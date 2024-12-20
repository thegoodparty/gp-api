import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Strategy } from 'passport-local'
import { AuthenticationService } from '../authentication.service'
import {
  LoginPayload,
  LoginPayloadSchema,
} from '../schemas/LoginPayload.schema'
import { User } from '@prisma/client'

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authenticationService: AuthenticationService) {
    super({
      usernameField: 'email',
    })
  }

  async validate(
    email: LoginPayload['email'],
    password: LoginPayload['password'],
  ): Promise<User> {
    const { email: validatedEmail, password: validatedPassword } =
      LoginPayloadSchema.parse({ email, password })
    return this.authenticationService.validateUserByEmailAndPassword(
      validatedEmail,
      validatedPassword,
    )
  }
}
