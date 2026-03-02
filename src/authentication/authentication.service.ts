import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotImplementedException,
  UnauthorizedException,
} from '@nestjs/common'
import { JsonWebTokenError, JwtService, TokenExpiredError } from '@nestjs/jwt'
import { UsersService } from '../users/services/users.service'
import { CreateUserInputDto } from '../users/schemas/CreateUserInput.schema'
import { LoginPayload } from './schemas/LoginPayload.schema'
import { compare } from 'bcrypt'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { nanoid } from 'nanoid'
import {
  SocialAuthPayload,
  SocialProvider,
  SocialTokenValidator,
} from './authentication.types'
import { OAuth2Client, TokenInfo } from 'google-auth-library'
import { PinoLogger } from 'nestjs-pino'

export const GP_API_ISSUER = 'gp-api'

const googleOAuthClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

const PASSWORD_RESET_TOKEN_TTL = '1h'

@Injectable()
export class AuthenticationService {
  // TODO: Move social token validators to separate SocialTokenValidationService
  private googleTokenValidator: SocialTokenValidator = async (
    socialToken: string,
    email: string,
  ) => {
    const lowercaseEmail = email.toLowerCase()
    let tokenInfo: TokenInfo | null = null

    try {
      tokenInfo = await googleOAuthClient.getTokenInfo(socialToken)
    } catch (e) {
      const msg = 'Failed to validate social token'
      this.logger.warn({ e }, msg)
      throw new UnauthorizedException(msg)
    }

    if (tokenInfo?.email?.toLowerCase() !== lowercaseEmail) {
      const msg = 'Email in token does not match email in request'
      this.logger.warn(msg)
      throw new UnauthorizedException(msg)
    }
    return lowercaseEmail
  }

  // TODO: https://goodparty.atlassian.net/browse/WEB-3421
  private facebookTokenValidator: SocialTokenValidator = async (
    _token: string,
    _email: string,
  ) => {
    throw new NotImplementedException(
      'Facebook token validation not implemented',
    )
    return ''
  }

  private SOCIAL_MEDIA_VALIDATORS_MAP: {
    [socialProvider in SocialProvider]: SocialTokenValidator
  } = {
    [SocialProvider.GOOGLE]: this.googleTokenValidator,
    [SocialProvider.FACEBOOK]: this.facebookTokenValidator,
  }

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuthenticationService.name)
  }

  generateAuthToken(payload: { email: string; sub: number }) {
    return this.jwtService.sign({ ...payload, iss: GP_API_ISSUER })
  }

  async register(userData: CreateUserInputDto) {
    const user = await this.usersService.createUser(userData)
    return {
      user,
      token: this.generateAuthToken({ email: user.email, sub: user.id }),
    }
  }

  async validatePassword(clearTextPassword: string, hashedPassword: string) {
    return compare(clearTextPassword, hashedPassword)
  }

  async validateUserByEmailAndPassword(
    email: LoginPayload['email'],
    password: LoginPayload['password'],
  ) {
    const user = await this.usersService.findUser({ email })

    if (!user) {
      throw new UnauthorizedException()
    }

    const validPassword = await this.validatePassword(
      password || '',
      user.password || '',
    )

    if (!validPassword) {
      throw new UnauthorizedException()
    }
    return user
  }

  async socialUserValidation(
    { socialToken, socialPic, email }: SocialAuthPayload,
    socialProvider: SocialProvider,
  ) {
    if (!this.SOCIAL_MEDIA_VALIDATORS_MAP[socialProvider]) {
      throw new BadRequestException('Invalid social provider')
    }
    this.logger.debug(
      {
        socialToken,
        socialPic,
        email,
      },
      `Validating user with ${socialProvider} token:`,
    )
    const user = await this.usersService.findUser({
      email: await this.SOCIAL_MEDIA_VALIDATORS_MAP[socialProvider](
        socialToken,
        email,
      ),
    })

    if (!user) {
      const msg = 'User not found by email'
      throw new UnauthorizedException(msg)
    }
    this.logger.debug(user, `User found by email:`)
    return this.usersService.updateUser(
      {
        id: user.id,
      },
      {
        avatar: socialPic || '',
      },
    )
  }

  async updatePasswordWithToken(
    email: string,
    token: string,
    password: string,
  ) {
    let user
    try {
      this.jwtService.verify(token)
      user = await this.usersService.findUserByResetToken(email, token)
    } catch (e) {
      if (
        e instanceof TokenExpiredError || // token expired
        e instanceof SyntaxError || // token parse failed
        e instanceof JsonWebTokenError || // malformed token
        e instanceof PrismaClientKnownRequestError // token doesn't match a user
      ) {
        throw new ForbiddenException(
          e instanceof TokenExpiredError
            ? 'Token has expired'
            : 'Invalid token',
        )
      }
      throw new InternalServerErrorException('Failed to update password', {
        cause: e,
      })
    }

    return await this.usersService.updatePassword(user.id, password, true)
  }

  generatePasswordResetToken() {
    const token = nanoid(48)

    return this.jwtService.sign(
      { token },
      { expiresIn: PASSWORD_RESET_TOKEN_TTL },
    )
  }
}
