import { Logger, Module } from '@nestjs/common'
import { AuthenticationService } from './authentication.service'
import { JwtModule } from '@nestjs/jwt'
import { AuthenticationController } from './authentication.controller'
import { APP_GUARD } from '@nestjs/core'
import { RolesGuard } from './guards/Roles.guard'
import { EmailModule } from 'src/email/email.module'
import { ClerkModule } from '@/vendors/clerk/clerk.module'

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
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
  imports: [
    ClerkModule,
    JwtModule.register({
      global: true,
      secret: process.env.AUTH_SECRET,
      signOptions: { expiresIn: JWT_EXPIRATION },
    }),
    EmailModule,
  ],
  exports: [AuthenticationService, JwtModule, ClerkModule],
  controllers: [AuthenticationController],
})
export class AuthenticationModule {}
