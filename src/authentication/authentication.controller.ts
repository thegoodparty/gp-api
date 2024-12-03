import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common'
import { AuthenticationService } from './authentication.service'
import { FastifyReply } from 'fastify'
import {
  CreateUserInput,
  CreateUserInputSchema,
} from '../users/schemas/CreateUserInput.schema'
import { ZodValidationPipe } from 'nestjs-zod'
import { clearAuthToken, setAuthToken } from './util/auth-token.util'
import {
  LoginRequestPayload,
  LoginPayloadSchema,
} from './schemas/LoginPayload.schema'
import { ReadUserOutputDTO } from '../users/schemas/ReadUserOutput.schema'

type LoginResult = { user: ReadUserOutputDTO; token: string }

@Controller('authentication')
export class AuthenticationController {
  constructor(private authenticationService: AuthenticationService) {}

  @Post('register')
  @HttpCode(HttpStatus.NO_CONTENT)
  async register(
    @Body(new ZodValidationPipe(CreateUserInputSchema))
    userData: CreateUserInput,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    const { token } = await this.authenticationService.register(userData)
    setAuthToken(token, response)
  }

  @Post('login')
  async login(
    @Body(new ZodValidationPipe(LoginPayloadSchema))
    loginPayload: LoginRequestPayload,
    @Res({ passthrough: true }) response: FastifyReply,
  ): Promise<LoginResult> {
    const { token, user } = await this.authenticationService.login(loginPayload)
    setAuthToken(token, response)
    return {
      user: new ReadUserOutputDTO(user),
      //TODO: token should NOT be exposed to the client on the response body here. Fix this.
      token,
    }
  }

  @Delete('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Res({ passthrough: true }) response: FastifyReply) {
    clearAuthToken(response)
  }
}
