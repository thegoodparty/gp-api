import { Module } from '@nestjs/common'
import { AuthenticationService } from './authentication.service'
import { UsersModule } from '../users/users.module'
import { PassportModule } from '@nestjs/passport'
import { JwtModule } from '@nestjs/jwt'
import { AuthenticationController } from './authentication.controller'
import { EmailModule } from 'src/email/email.module'

const JWT_EXPIRATION = '1y'

@Module({
  providers: [AuthenticationService],

  imports: [
    UsersModule,
    PassportModule,
    JwtModule.register({
      global: true,
      secret: process.env.AUTH_SECRET,
      signOptions: { expiresIn: JWT_EXPIRATION },
    }),
    EmailModule,
  ],

  controllers: [AuthenticationController],
})
export class AuthenticationModule {}
