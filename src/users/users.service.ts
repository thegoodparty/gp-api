import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma, User } from '@prisma/client'
import { genSalt, hash } from 'bcrypt'
import { CreateUserInputDto } from './schemas/CreateUserInput.schema'
import { generateRandomPassword } from './util/passwords.util'
import { trimMany } from '../shared/util/strings.util'
import { nanoid } from 'nanoid'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { JwtService, TokenExpiredError } from '@nestjs/jwt'

const PASSWORD_RESET_TOKEN_TTL = '30 days'

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  getAllUsers() {
    return this.prisma.user.findMany()
  }

  findUser(where: Prisma.UserWhereUniqueInput): Promise<User | null> {
    return this.prisma.user.findUnique({
      where,
    })
  }

  findUserByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    })
  }

  async findUserByResetToken(token: string) {
    try {
      this.jwt.verify(token)
      return await this.prisma.user.findFirstOrThrow({
        where: { passwordResetToken: token },
      })
    } catch (e) {
      if (
        e instanceof SyntaxError || // token parse failed
        e instanceof PrismaClientKnownRequestError // token doesn't match a user
      ) {
        throw new BadRequestException('Invalid token')
      } else if (e instanceof TokenExpiredError) {
        throw new BadRequestException('Token has expired')
      }

      throw e
    }
  }

  async createUser(userData: CreateUserInputDto): Promise<User> {
    const {
      password = '',
      firstName,
      lastName,
      email,
      zip,
      phone,
      name,
    } = userData
    const trimmedPassword = password
      ? password.trim()
      : generateRandomPassword()
    const hashedPassword =
      password && (await hash(trimmedPassword, await genSalt()))
    const existingUser = await this.findUser({ email })
    if (existingUser) {
      throw new ConflictException('User with this email already exists')
    }

    // TODO: create/update customer in CRM:
    // await submitCrmForm(firstName, lastName, email, phone);
    // await sails.helpers.crm.updateUser(user);

    const {
      firstName: firstNameTrimmed,
      lastName: lastNameTrimmed,
      ...trimmed
    } = trimMany({
      firstName,
      lastName,
      phone,
      ...(zip ? { zip } : {}),
    })

    return this.prisma.user.create({
      data: {
        ...userData,
        ...trimmed,
        ...(hashedPassword ? { password: hashedPassword } : {}),
        name: name?.trim() || `${firstNameTrimmed} ${lastNameTrimmed}`,
      },
    })
  }

  async deleteUser(id: number) {
    return this.prisma.user.delete({
      where: {
        id,
      },
    })
  }

  async generatePasswordResetToken(userId: number): Promise<User> {
    const token = nanoid(48)

    const jwt = this.jwt.sign(
      { token },
      { expiresIn: PASSWORD_RESET_TOKEN_TTL },
    )

    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: {
          passwordResetToken: jwt,
        },
      })
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError) {
        console.log('Could not find user to reset password')
        throw new NotFoundException('User not found')
      }

      throw e
    }
  }
}
