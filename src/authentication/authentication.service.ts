import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common'
import { JsonWebTokenError, JwtService, TokenExpiredError } from '@nestjs/jwt'
import { UsersService } from '../users/services/users.service'
import { compare } from 'bcrypt'
import { User } from '@prisma/client'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { nanoid } from 'nanoid'
import { PinoLogger } from 'nestjs-pino'

const PASSWORD_RESET_TOKEN_TTL = '1h'

@Injectable()
export class AuthenticationService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuthenticationService.name)
  }

  async validatePassword(clearTextPassword: string, hashedPassword: string) {
    return compare(clearTextPassword, hashedPassword)
  }

  async updatePasswordWithToken(
    email: string,
    token: string,
    password: string,
  ) {
    let user: User
    try {
      this.jwtService.verify(token)
      user = await this.usersService.findUserByResetToken(email, token)
    } catch (e) {
      if (
        e instanceof TokenExpiredError || // token expired
        e instanceof SyntaxError || // token parse failed
        e instanceof JsonWebTokenError || // malformed token
        e instanceof PrismaClientKnownRequestError // token doesn't match a user
      ) {
        throw new ForbiddenException(
          e instanceof TokenExpiredError
            ? 'Token has expired'
            : 'Invalid token',
        )
      }
      throw new InternalServerErrorException('Failed to update password', {
        cause: e,
      })
    }

    return await this.usersService.updatePassword(user.id, password, true)
  }

  generatePasswordResetToken() {
    const token = nanoid(48)

    return this.jwtService.sign(
      { token },
      { expiresIn: PASSWORD_RESET_TOKEN_TTL },
    )
  }
}
