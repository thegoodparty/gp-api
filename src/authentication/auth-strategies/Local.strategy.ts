import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Strategy } from 'passport-local'
import { AuthenticationService } from '../authentication.service'
import {
  LoginPayload,
  LoginPayloadSchema,
} from '../schemas/LoginPayload.schema'
import { User } from '@prisma/client'
import { ZodValidationException } from 'nestjs-zod'

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authenticationService: AuthenticationService) {
    // PassportStrategy() returns error-typed class — @nestjs/passport types need upstream fix
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    super({
      usernameField: 'email',
    })
  }

  async validate(
    email: LoginPayload['email'],
    password: LoginPayload['password'],
  ): Promise<User> {
    const result = LoginPayloadSchema.safeParse({ email, password })

    if (!result.success) {
      throw new ZodValidationException(result.error)
    }

    const { email: validatedEmail, password: validatedPassword } = result.data

    return this.authenticationService.validateUserByEmailAndPassword(
      validatedEmail,
      validatedPassword,
    )
  }
}
