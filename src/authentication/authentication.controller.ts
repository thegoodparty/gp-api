import {
  Body,
  Controller,
  forwardRef,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Res,
  UsePipes,
} from '@nestjs/common'
import { AuthenticationService } from './authentication.service'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReadUserOutputSchema } from '@goodparty_org/contracts'
import { RecoverPasswordSchema } from './schemas/RecoverPasswordEmail.schema'
import { SetPasswordEmailSchema } from './schemas/SetPasswordEmail.schema'
import { UsersService } from 'src/users/services/users.service'
import { EmailService } from 'src/email/email.service'
import { ResetPasswordSchema } from './schemas/ResetPassword.schema'
import { PublicAccess } from './decorators/PublicAccess.decorator'
import { Roles } from './decorators/Roles.decorator'
import { User, UserRole } from '@prisma/client'
import { ReqUser } from './decorators/ReqUser.decorator'
import { userHasRole } from 'src/users/util/users.util'
import { FastifyReply } from 'fastify'
import { EVENTS } from 'src/vendors/segment/segment.types'
import { AnalyticsService } from 'src/analytics/analytics.service'

@PublicAccess()
@Controller('authentication')
@UsePipes(ZodValidationPipe)
export class AuthenticationController {
  constructor(
    private authenticationService: AuthenticationService,
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,
    private emailService: EmailService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Post('send-recover-password-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  async sendRecoverPasswordEmail(@Body() { email }: RecoverPasswordSchema) {
    let user = await this.usersService.findUserByEmail(email)
    if (!user) {
      // don't want to expose that user with email doesn't exist
      return
    }
    this.analytics.track(user.id, EVENTS.Account.PasswordResetRequested)
    // generate and set reset token on user
    const token = this.authenticationService.generatePasswordResetToken()
    user = await this.usersService.setResetToken(user.id, token)
    return await this.emailService.sendRecoverPasswordEmail(user)
  }

  @Roles(UserRole.admin, UserRole.sales)
  @Post('send-set-password-email')
  async sendSetPasswordEmail(
    @ReqUser() reqUser: User,
    @Res({ passthrough: true }) response: FastifyReply,
    @Body() { userId }: SetPasswordEmailSchema,
  ) {
    const token = this.authenticationService.generatePasswordResetToken()
    const user = await this.usersService.setResetToken(userId, token)
    await this.emailService.sendSetPasswordEmail(user)

    if (userHasRole(reqUser, UserRole.admin)) {
      response.statusCode = HttpStatus.OK
      return { token }
    }

    response.statusCode = HttpStatus.NO_CONTENT
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: ResetPasswordSchema) {
    const { email, token, password } = body

    const user = await this.authenticationService.updatePasswordWithToken(
      email,
      token,
      password,
    )

    return ReadUserOutputSchema.parse(user)
  }
}
