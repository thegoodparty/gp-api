import { ExtractJwt, Strategy } from 'passport-jwt'
import { PassportStrategy } from '@nestjs/passport'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtPayload } from 'jsonwebtoken'
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
    if (!userId) {
      throw new UnauthorizedException()
    }
    const user = await this.usersService.findUser({
      id: parseInt(userId),
    })
    if (!user) {
      throw new UnauthorizedException()
    }
    return user
  }
}
