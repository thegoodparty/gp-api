import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { UsersService } from '../users/users.service'
import { CreateUserInputDto } from '../users/schemas/CreateUserInput.schema'
import { LoginRequestPayloadDto } from './schemas/LoginPayload.schema'
import { compare } from 'bcrypt'

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

  async login({ email, password }: LoginRequestPayloadDto) {
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
    return {
      user,
      token: this.generateAuthToken({ email: user.email, sub: user.id }),
    }
  }
}
