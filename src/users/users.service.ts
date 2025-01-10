import { ConflictException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Prisma, User } from '@prisma/client'
import { CreateUserInputDto } from './schemas/CreateUserInput.schema'
import { generateRandomPassword, hashPassword } from './util/passwords.util'
import { trimMany } from '../shared/util/strings.util'
import { WithOptional } from 'src/shared/types/utility.types'
import {
  UserWhereInputWithJsonFields,
  UserWhereUniqueInputWithJsonFields,
} from './users.types'

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findAllUsers(where?: UserWhereInputWithJsonFields) {
    return this.prisma.user.findMany({ where })
  }

  findUser(where: UserWhereUniqueInputWithJsonFields) {
    return this.prisma.user.findUnique({
      where,
    })
  }

  findUserOrThrow(where: UserWhereUniqueInputWithJsonFields) {
    return this.prisma.user.findUniqueOrThrow({
      where,
    })
  }

  findUserByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    })
  }

  findUserByResetToken(email: string, token: string) {
    return this.prisma.user.findFirstOrThrow({
      where: {
        email: { equals: email, mode: 'insensitive' },
        passwordResetToken: token,
      },
    })
  }

  async updatePassword(
    userId: number,
    password: string,
    clearResetToken?: boolean,
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        // hash password
        password: await hashPassword(password),
        // clear reset token
        passwordResetToken: clearResetToken ? null : undefined,
      },
    })
  }

  setResetToken(userId: number, passwordResetToken: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordResetToken,
      },
    })
  }

  async createUser(
    userData: WithOptional<CreateUserInputDto, 'password' | 'phone'>,
  ): Promise<User> {
    const { password, firstName, lastName, email, zip, phone, name } = userData

    const hashedPassword = await hashPassword(
      password ?? generateRandomPassword(),
    )
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
      ...(phone ? { phone } : {}),
      ...(zip ? { zip } : {}),
    })

    return this.prisma.user.create({
      data: {
        ...userData,
        ...trimmed,
        password: hashedPassword,
        name: name?.trim() || `${firstNameTrimmed} ${lastNameTrimmed}`,
      },
    })
  }

  async updateUser(
    where: UserWhereUniqueInputWithJsonFields,
    data: Prisma.UserUpdateInput,
  ) {
    return this.prisma.user.update({
      where,
      data,
    })
  }

  async patchUserMetaData(user: User, newMetaData: PrismaJson.UserMetaData) {
    const currentUser = await this.findUser({ id: user.id })
    const currentMetaData = currentUser?.metaData
    return this.updateUser(
      {
        id: user.id,
      },
      {
        metaData: {
          ...currentMetaData,
          ...newMetaData,
        },
      },
    )
  }

  async deleteUser(id: number) {
    return this.prisma.user.delete({
      where: {
        id,
      },
    })
  }
}
