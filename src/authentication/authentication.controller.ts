import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  Res,
  UseGuards,
  UsePipes,
} from '@nestjs/common'
import { AuthenticationService } from './authentication.service'
import { ZodValidationPipe } from 'nestjs-zod'
import { clearAuthToken, setAuthToken } from './util/auth-token.util'
import { LoginRequestPayloadDto } from './schemas/LoginPayload.schema'
import {
  ReadUserOutput,
  ReadUserOutputSchema,
} from '../users/schemas/ReadUserOutput.schema'
import { RecoverPasswordSchema } from './schemas/RecoverPasswordEmail.schema'
import { SetPasswordEmailSchema } from './schemas/SetPasswordEmail.schema'
import { UsersService } from 'src/users/users.service'
import { EmailService } from 'src/email/email.service'
import { ResetPasswordSchema } from './schemas/ResetPassword.schema'
import { CampaignsService } from 'src/campaigns/campaigns.service'
import { UserRole } from '@prisma/client'
import { AuthGuard } from '@nestjs/passport'
import { FastifyReply } from 'fastify'
import { RequestWithUser } from './authentication.types'
import { PublicAccess } from './decorators/PublicAccess.decorator'
import { RegisterUserInputDto } from './schemas/RegisterUserInput.schema'

type LoginResult = { user: ReadUserOutput; token: string }

@PublicAccess()
@Controller('authentication')
@UsePipes(ZodValidationPipe)
export class AuthenticationController {
  constructor(
    private authenticationService: AuthenticationService,
    private usersService: UsersService,
    private campaignsService: CampaignsService,
    private emailService: EmailService,
  ) {}

  @Post('register')
  async register(@Body() userData: RegisterUserInputDto) {
    const { token, user } = await this.authenticationService.register(userData)
    return { user: ReadUserOutputSchema.parse(user), token }
  }

  @UseGuards(AuthGuard('local'))
  @Post('login')
  async login(@Request() { user }: RequestWithUser): Promise<LoginResult> {
    return {
      user: ReadUserOutputSchema.parse(user),
      token: this.authenticationService.generateAuthToken({
        email: user.email,
        sub: user.id,
      }),
    }
  }

  @Delete('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Res({ passthrough: true }) response: FastifyReply) {
    clearAuthToken(response)
  }

  @Post('recover-password-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  async sendRecoverPasswordEmail(@Body() { email }: RecoverPasswordSchema) {
    let user = await this.usersService.findUserByEmail(email)

    if (!user) {
      // don't want to expose that user with email doesn't exist
      return
    }

    // generate and set reset token on user
    const token = this.authenticationService.generatePasswordResetToken()
    user = await this.usersService.setResetToken(user.id, token)
    return await this.emailService.sendRecoverPasswordEmail(user)
  }

  @Post('set-password-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  // TODO: make this admin only!
  async sendSetPasswordEmail(@Body() { userId }: SetPasswordEmailSchema) {
    const token = this.authenticationService.generatePasswordResetToken()
    const user = await this.usersService.setResetToken(userId, token)
    return this.emailService.sendSetPasswordEmail(user)
  }

  @Post('reset-password')
  async resetPassword(
    @Body() body: ResetPasswordSchema,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    const { email, token, password, adminCreate } = body

    const user = await this.authenticationService.updatePasswordWithToken(
      email,
      token,
      password,
    )
    const userOut = ReadUserOutputSchema.parse(user)

    // TODO: "adminCreate" should probably be "loginAfterReset" or something more descriptive
    // leaving as is for now compatibility with existing frontend
    if (adminCreate && user.role !== UserRole.sales) {
      // check if the campaign attached to this user is marked as created by admin
      // to automatically login after the password change
      const campaign = await this.campaignsService.findByUser(user.id)

      if (campaign.data.createdBy !== 'admin') {
        // don't login just return
        return userOut
      }

      // otherwise log in for user
      const authToken = this.authenticationService.generateAuthToken({
        email: user.email,
        sub: user.id,
      })

      setAuthToken(authToken, response)

      return {
        user: userOut,
        //TODO: token should NOT be exposed to the client on the response body here. Fix this.
        token,
      }
    }

    return userOut
  }
}
