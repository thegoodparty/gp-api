import { ConflictException, Injectable } from '@nestjs/common'
import { PrismaService } from '../shared/services/prisma.service'
import { Prisma, User } from '@prisma/client'
import { genSalt, hash } from 'bcrypt'
import { CreateUserInputDto } from './schemas/CreateUserInput.schema'
import { generateRandomPassword } from './util/passwords.util'
import { trimMany } from '../shared/util/strings.util'

type UniqueUserWhere = Prisma.AtLeast<
  {
    id?: number
    email?: string
  },
  'id' | 'email'
>

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getAllUsers() {
    return this.prisma.user.findMany()
  }

  async findUser(where: UniqueUserWhere): Promise<User | null> {
    return this.prisma.user.findUnique({
      where,
    })
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
}
