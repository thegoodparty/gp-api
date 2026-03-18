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
    const user = await this.usersService.findUser({
      // Type narrowing from nullable/union — runtime context guarantees string but type is broader
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      id: parseInt(userId as string),
    })
    if (!user) {
      throw new UnauthorizedException()
    }
    return user
  }
}
