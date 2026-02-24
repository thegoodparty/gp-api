import {
  Body,
  Controller,
  forwardRef,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Res,
  UseGuards,
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
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { AuthGuard } from '@nestjs/passport'
import { LoginResult } from './authentication.types'
import { PublicAccess } from './decorators/PublicAccess.decorator'
import { RegisterUserInputDto } from './schemas/RegisterUserInput.schema'
import { Roles } from './decorators/Roles.decorator'
import { User, UserRole } from '@prisma/client'
import { ReqUser } from './decorators/ReqUser.decorator'
import { userHasRole } from 'src/users/util/users.util'
import { FastifyReply } from 'fastify'
import { SOCIAL_LOGIN_STRATEGY_NAME } from './auth-strategies/SocialLogin.strategy'
import { CrmUsersService } from '../users/services/crmUsers.service'
import { setTokenCookie } from './util/setTokenCookie.util'
import { CampaignCreatedBy } from 'src/campaigns/campaigns.types'
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
    private campaignsService: CampaignsService,
    private emailService: EmailService,
    private readonly crmUsers: CrmUsersService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Post('register')
  async register(
    @Res({ passthrough: true }) response: FastifyReply,
    @Body() userData: RegisterUserInputDto,
  ) {
    const { token, user } = await this.authenticationService.register(userData)
    setTokenCookie(response, token)
    const campaign = await this.campaignsService.createForUser(user)
    return { user: ReadUserOutputSchema.parse(user), token, campaign }
  }

  private async reconcileCampaignForUser(
    user: User,
  ): Promise<LoginResult['campaign']> {
    const existingCampaign = await this.campaignsService.findByUserId(user.id)
    return existingCampaign || (await this.campaignsService.createForUser(user))
  }

  @UseGuards(AuthGuard('local'))
  @Post('login')
  async login(
    @Res({ passthrough: true }) response: FastifyReply,
    @ReqUser() user: User,
  ): Promise<LoginResult> {
    const token = this.authenticationService.generateAuthToken({
      email: user.email,
      sub: user.id,
    })

    setTokenCookie(response, token)

    this.crmUsers.trackUserLogin(user)

    return {
      user: ReadUserOutputSchema.parse(user),
      campaign: await this.reconcileCampaignForUser(user),
      token,
    }
  }

  @UseGuards(AuthGuard(SOCIAL_LOGIN_STRATEGY_NAME))
  @Post('social-login/:socialProvider')
  async socialLogin(
    @Res({ passthrough: true }) response,
    @ReqUser() user: User,
  ): Promise<LoginResult> {
    const token = this.authenticationService.generateAuthToken({
      email: user.email,
      sub: user.id,
    })

    setTokenCookie(response, token)
    return {
      user: ReadUserOutputSchema.parse(user),
      campaign: await this.reconcileCampaignForUser(user),
      token,
    }
  }

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
    const { email, token, password, adminCreate } = body

    const user = await this.authenticationService.updatePasswordWithToken(
      email,
      token,
      password,
    )
    const userOut = ReadUserOutputSchema.parse(user)

    // TODO: "adminCreate" should probably be "loginAfterReset" or something more descriptive
    // leaving as is for now compatibility with existing frontend
    if (adminCreate) {
      // check if the campaign attached to this user is marked as created by admin
      // to automatically login after the password change
      const campaign = await this.campaignsService.findByUserId(user.id)

      if (campaign?.data.createdBy !== CampaignCreatedBy.ADMIN) {
        // don't login just return
        return userOut
      }

      // otherwise log in for user
      return {
        user: userOut,
        token: this.authenticationService.generateAuthToken({
          email: user.email,
          sub: user.id,
        }),
      }
    }

    return userOut
  }
}
