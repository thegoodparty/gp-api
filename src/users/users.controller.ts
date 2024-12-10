import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotImplementedException,
  Post,
  UsePipes,
} from '@nestjs/common'
import { EmailService } from 'src/email/email.service'
import { SetPasswordEmailSchema } from './schemas/SetPasswordEmail.schema'
import { RecoverPasswordSchema } from './schemas/RecoverPasswordEmail.schema'
import { UsersService } from './users.service'
import { ZodValidationPipe } from 'nestjs-zod'
import { ResetPasswordSchema } from './schemas/ResetPassword.schema'

@Controller('users')
@UsePipes(ZodValidationPipe)
export class UsersController {
  constructor(
    private usersService: UsersService,
    private emailService: EmailService,
  ) {}

  @Post('recover-password-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  async sendRecoverPasswordEmail(@Body() { email }: RecoverPasswordSchema) {
    let user = await this.usersService.findUserByEmail(email)

    if (!user) {
      // don't want to expose that user with email doesn't exist
      return
    }

    // generate and set reset token on user
    user = await this.usersService.generatePasswordResetToken(user.id)

    return await this.emailService.sendRecoverPasswordEmail(user)
  }

  @Post('set-password-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  // TODO: make this admin only!
  async sendSetPasswordEmail(@Body() { userId }: SetPasswordEmailSchema) {
    const user = await this.usersService.generatePasswordResetToken(userId)
    return this.emailService.sendSetPasswordEmail(user)
  }

  @Post('reset-password')
  async resetPassword(@Body() body: ResetPasswordSchema) {
    const { token, password, confirmPassword } = body
    const user = await this.usersService.findUserByResetToken(token)

    // TODO: update user with new password
    throw new NotImplementedException('Reset PW not implemented yet')

    return
  }
}
