import { Logger, Module } from '@nestjs/common'
import { AuthenticationService } from './authentication.service'
import { UsersModule } from '../users/users.module'
import { PassportModule } from '@nestjs/passport'
import { JwtModule } from '@nestjs/jwt'
import { AuthenticationController } from './authentication.controller'

const JWT_EXPIRATION = '1y'

if (!process.env.AUTH_SECRET) {
  const logger = new Logger('AuthenticationModule')
  const msg = 'AUTH_SECRET is required for application startup'
  logger.error(msg)
  throw new Error(msg)
}

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
  ],

  controllers: [AuthenticationController],
})
export class AuthenticationModule {}
