import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService, TokenExpiredError } from '@nestjs/jwt'
import { UsersService } from '../users/users.service'
import { CreateUserInputDto } from '../users/schemas/CreateUserInput.schema'
import {
  LoginPayload,
  LoginRequestPayloadDto,
} from './schemas/LoginPayload.schema'
import { compare } from 'bcrypt'
import { User } from '@prisma/client'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { nanoid } from 'nanoid'

const PASSWORD_RESET_TOKEN_TTL = '30 days'

@Injectable()
export class AuthenticationService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  generateAuthToken(payload: { email: string; sub: number }) {
    return this.jwtService.sign(payload)
  }

  async register(userData: CreateUserInputDto) {
    const user = await this.usersService.createUser(userData)
    return {
      user,
      token: this.generateAuthToken({ email: user.email, sub: user.id }),
    }
  }

  async validateUser(
    email: LoginPayload['email'],
    password: LoginPayload['password'],
  ) {
    const user = await this.usersService.findUser({ email })

    if (!user) {
      throw new UnauthorizedException('User email not found')
    }

    const validPassword = await compare(
      password as string,
      user.password as string,
    )

    if (!validPassword) {
      throw new UnauthorizedException('Invalid password')
    }
    return user
  }

  async updatePasswordWithToken(
    email: string,
    token: string,
    password: string,
  ) {
    let user
    try {
      this.jwtService.verify(token)
      user = await this.usersService.findUserByResetToken(email, token)
    } catch (e) {
      if (
        e instanceof TokenExpiredError || // token expired
        e instanceof SyntaxError || // token parse failed
        e instanceof PrismaClientKnownRequestError // token doesn't match a user
      ) {
        throw new ForbiddenException(
          e instanceof TokenExpiredError
            ? 'Token has expired'
            : 'Invalid token',
        )
      }
      throw e
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
