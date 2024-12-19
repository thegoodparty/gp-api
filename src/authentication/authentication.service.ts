import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { JsonWebTokenError, JwtService, TokenExpiredError } from '@nestjs/jwt'
import { UsersService } from '../users/users.service'
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

const googleOAuthClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

const PASSWORD_RESET_TOKEN_TTL = '1h'

@Injectable()
export class AuthenticationService {
  logger = new Logger(AuthenticationService.name)

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
      this.logger.warn(msg, e)
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
    token: string,
    email: string,
  ) => {
    return ''
  }

  private SOCIAL_MEDIA_VALIDATORS_MAP: { [socialProvider in SocialProvider] } =
    {
      [SocialProvider.GOOGLE]: this.googleTokenValidator,
      [SocialProvider.FACEBOOK]: this.facebookTokenValidator,
    }

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  generateAuthToken(payload: { email: string; sub: number }) {
    return this.jwtService.sign(payload)
  }

  async register(userData: CreateUserInputDto) {
    const user = await this.usersService.createUser(userData)
    return {
      user,
      token: this.generateAuthToken({ email: user.email, sub: user.id }),
    }
  }

  async validateUserByEmailAndPassword(
    email: LoginPayload['email'],
    password: LoginPayload['password'],
  ) {
    const user = await this.usersService.findUser({ email })

    if (!user) {
      throw new UnauthorizedException('User email not found')
    }

    const validPassword = await compare(
      password as string,
      user.password as string,
    )

    if (!validPassword) {
      throw new UnauthorizedException('Invalid password')
    }
    return user
  }

  async socialUserValidation(
    { socialToken, socialPic, email }: SocialAuthPayload,
    socialProvider: SocialProvider,
  ) {
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
      throw e
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
