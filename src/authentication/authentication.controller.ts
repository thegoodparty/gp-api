import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
  UsePipes,
} from '@nestjs/common'
import { AuthenticationService } from './authentication.service'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReadUserOutputSchema } from '../users/schemas/ReadUserOutput.schema'
import { RecoverPasswordSchema } from './schemas/RecoverPasswordEmail.schema'
import { SetPasswordEmailSchema } from './schemas/SetPasswordEmail.schema'
import { UsersService } from 'src/users/users.service'
import { EmailService } from 'src/email/email.service'
import { ResetPasswordSchema } from './schemas/ResetPassword.schema'
import { CampaignsService } from 'src/campaigns/campaigns.service'
import { AuthGuard } from '@nestjs/passport'
import { LoginResult, RequestWithUser } from './authentication.types'
import { PublicAccess } from './decorators/PublicAccess.decorator'
import { RegisterUserInputDto } from './schemas/RegisterUserInput.schema'
import { Roles } from './decorators/Roles.decorator'
import { UserRole } from '@prisma/client'

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

  @Post('send-recover-password-email')
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

  @Roles(UserRole.admin)
  @Post('send-set-password-email')
  async sendSetPasswordEmail(@Body() { userId }: SetPasswordEmailSchema) {
    const token = this.authenticationService.generatePasswordResetToken()
    const user = await this.usersService.setResetToken(userId, token)
    await this.emailService.sendSetPasswordEmail(user)

    return { token }
  }

  @Post('reset-password')
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
      const campaign = await this.campaignsService.findByUser(user.id)

      if (campaign.data.createdBy !== 'admin') {
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
