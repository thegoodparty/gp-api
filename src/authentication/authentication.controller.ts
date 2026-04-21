import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Res,
  UsePipes,
} from '@nestjs/common'
import { AuthenticationService } from './authentication.service'
import { ZodValidationPipe } from 'nestjs-zod'
import { SetPasswordEmailSchema } from './schemas/SetPasswordEmail.schema'
import { UsersService } from 'src/users/services/users.service'
import { EmailService } from 'src/email/email.service'
import { PublicAccess } from './decorators/PublicAccess.decorator'
import { Roles } from './decorators/Roles.decorator'
import { User, UserRole } from '@prisma/client'
import { ReqUser } from './decorators/ReqUser.decorator'
import { userHasRole } from 'src/users/util/users.util'
import { FastifyReply } from 'fastify'

@PublicAccess()
@Controller('authentication')
@UsePipes(ZodValidationPipe)
export class AuthenticationController {
  constructor(
    private authenticationService: AuthenticationService,
    private usersService: UsersService,
    private emailService: EmailService,
  ) {}

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
}
