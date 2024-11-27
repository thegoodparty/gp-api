import { Module } from '@nestjs/common'
import { AuthenticationService } from './authentication.service'
import { UsersModule } from '../users/users.module'
import { PassportModule } from '@nestjs/passport'
import { JwtModule } from '@nestjs/jwt'

const JWT_EXPIRATION = '1y'

@Module({
  providers: [AuthenticationService],
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.register({
      global: true,
      secret: 'VERY_SECRET_JWT_SECRET',
      signOptions: { expiresIn: JWT_EXPIRATION },
    }),
  ],
})
export class AuthenticationModule {}
