import { Logger, Module } from '@nestjs/common'
import { AuthenticationService } from './services/authentication.service'
import { PassportModule } from '@nestjs/passport'
import { JwtModule } from '@nestjs/jwt'
import { AuthenticationController } from './authentication.controller'
import { JwtAuthStrategy } from './auth-strategies/JwtAuth.strategy'
import { APP_GUARD } from '@nestjs/core'
import { RolesGuard } from './guards/Roles.guard'
import { LocalStrategy } from './auth-strategies/Local.strategy'
import { EmailModule } from 'src/email/email.module'
import { SocialLoginStrategy } from './auth-strategies/SocialLogin.strategy'
import { SessionsService } from './services/sessions.service'

const JWT_EXPIRATION = '1y'

if (!process.env.AUTH_SECRET) {
  const logger = new Logger('AuthenticationModule')
  const msg = 'AUTH_SECRET is required for application startup'
  logger.error(msg)
  throw new Error(msg)
}

@Module({
  providers: [
    AuthenticationService,
    SessionsService,
    LocalStrategy,
    SocialLoginStrategy,
    JwtAuthStrategy,
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
  imports: [
    PassportModule,
    JwtModule.register({
      global: true,
      secret: process.env.AUTH_SECRET,
      signOptions: { expiresIn: JWT_EXPIRATION },
    }),
    EmailModule,
  ],
  exports: [AuthenticationService, JwtModule],
  controllers: [AuthenticationController],
})
export class AuthenticationModule {}
