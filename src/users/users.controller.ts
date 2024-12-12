import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  NotImplementedException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'
import { UsersService } from './users.service'
import { ReadUserOutputSchema } from './schemas/ReadUserOutput.schema'
import { User } from '@prisma/client'
import { ReqUser } from '../authentication/decorators/req-user.decorator'
import { UserOwnerOrAdminGuard } from './guards/user-owner-or-admin.guard'
import { Roles } from '../authentication/decorators/roles.decorator'
import { CreateUserInputDto } from './schemas/CreateUserInput.schema'
import { generateRandomPassword } from './util/passwords.util'
import { RecoverPasswordSchema } from './schemas/RecoverPasswordEmail.schema'
import { SetPasswordEmailSchema } from './schemas/SetPasswordEmail.schema'
import { ResetPasswordSchema } from './schemas/ResetPassword.schema'
import { HttpStatus } from '@nestjs/common'
import { EmailService } from '../email/email.service'

@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name)

  constructor(
    private usersService: UsersService,
    private emailService: EmailService,
  ) {}

  @Roles('admin')
  @Post()
  async create(@Body() userData: CreateUserInputDto) {
    const password = userData.password || generateRandomPassword()
    return await this.usersService.createUser({ ...userData, password })
  }

  @UseGuards(UserOwnerOrAdminGuard)
  @Get(':id')
  async findOne(@Param('id') id: string, @ReqUser() user: User) {
    const paramId = parseInt(id)
    if (paramId === user.id) {
      // No need to hit the DB again if the user is requesting their own data
      return ReadUserOutputSchema.parse(user)
    }

    const dbUser = await this.usersService.findUser({ id: paramId })
    if (!dbUser) {
      throw new NotFoundException('User not found')
    }
    return ReadUserOutputSchema.parse(dbUser)
  }

  @UseGuards(UserOwnerOrAdminGuard)
  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string) {
    try {
      return await this.usersService.deleteUser(parseInt(id))
    } catch (e: Error | any) {
      if (e?.code !== 'P2025') {
        // P2025: Prisma error code for "Record to delete does not exist"
        throw e
      }
      this.logger.warn(
        `request to delete user that does not exist, w/ id: ${id}`,
      )
    }
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
    // TODO: make this method just create the token, then use a service update
    //  method to set it on the user
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
  }
}
