import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Res,
  UsePipes,
} from '@nestjs/common'
import { AuthenticationService } from './authentication.service'
import { FastifyReply } from 'fastify'
import { CreateUserInputDto } from '../users/schemas/CreateUserInput.schema'
import { ZodValidationPipe } from 'nestjs-zod'
import { clearAuthToken, setAuthToken } from './util/auth-token.util'
import { LoginRequestPayloadDto } from './schemas/LoginPayload.schema'
import {
  ReadUserOutput,
  ReadUserOutputSchema,
} from '../users/schemas/ReadUserOutput.schema'
import { EmailService } from 'src/email/email.service'
import { RecoverPasswordSchema } from './schemas/recoverPassword.schema'

type LoginResult = { user: ReadUserOutput; token: string }

@Controller('authentication')
@UsePipes(ZodValidationPipe)
export class AuthenticationController {
  constructor(
    private authenticationService: AuthenticationService,
    private emailService: EmailService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.NO_CONTENT)
  async register(
    @Body() userData: CreateUserInputDto,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    const { token } = await this.authenticationService.register(userData)
    setAuthToken(token, response)
  }

  @Post('login')
  async login(
    @Body()
    loginPayload: LoginRequestPayloadDto,
    @Res({ passthrough: true }) response: FastifyReply,
  ): Promise<LoginResult> {
    const { token, user } = await this.authenticationService.login(loginPayload)
    setAuthToken(token, response)
    return {
      user: ReadUserOutputSchema.parse(user),
      //TODO: token should NOT be exposed to the client on the response body here. Fix this.
      token,
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
    try {
      return await this.emailService.sendRecoverPasswordEmail(email)
    } catch (e) {
      if (e instanceof NotFoundException) {
        // don't want to expose that user with email/phone doesn't exist
        return
      }

      throw e
    }
  }
}
