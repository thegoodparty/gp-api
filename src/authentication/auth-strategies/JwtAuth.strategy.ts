import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { JwtPayload } from 'jsonwebtoken'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { UsersService } from '../../users/services/users.service'

@Injectable()
export class JwtAuthStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.AUTH_SECRET!,
    })
  }

  async validate({ sub: userId }: JwtPayload) {
    const user = await this.usersService.findUser({
      id: parseInt(userId as string),
    })
    if (!user) {
      throw new UnauthorizedException()
    }
    return user
  }
}
