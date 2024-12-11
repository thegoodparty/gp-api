import {
  Body,
  Controller,
  Post,
  Request,
  UseGuards,
  UsePipes,
} from '@nestjs/common'
import { AuthenticationService } from './authentication.service'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReadUserOutputSchema } from '../users/schemas/ReadUserOutput.schema'
import { AuthGuard } from '@nestjs/passport'
import { LoginResult, RequestWithUser } from './authentication.types'
import { PublicAccess } from './decorators/public-access.decorator'
import { RegisterUserInputDto } from './schemas/RegisterUserInput.schema'

@PublicAccess()
@Controller('authentication')
@UsePipes(ZodValidationPipe)
export class AuthenticationController {
  constructor(private authenticationService: AuthenticationService) {}

  @Post('register')
  async register(@Body() userData: RegisterUserInputDto) {
    const { token, user } = await this.authenticationService.register(userData)
    return { user: ReadUserOutputSchema.parse(user), token }
  }

  @UseGuards(AuthGuard('local'))
  @Post('login')
  async login(@Request() { user }: RequestWithUser): Promise<LoginResult> {
    console.log(`user =>`, user)
    return {
      user: ReadUserOutputSchema.parse(user),
      token: this.authenticationService.generateAuthToken({
        email: user.email,
        sub: user.id,
      }),
    }
  }
}
