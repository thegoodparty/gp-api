import { ConflictException, Injectable } from '@nestjs/common'
import { Campaign, Prisma, User } from '@prisma/client'
import { CreateUserInputDto } from './schemas/CreateUserInput.schema'
import { hashPassword } from './util/passwords.util'
import { trimMany } from '../shared/util/strings.util'
import { WithOptional } from 'src/shared/types/utility.types'
import { FullStoryService } from '../fullStory/fullStory.service'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'

@Injectable()
export class UsersService extends createPrismaBase(MODELS.User) {
  constructor(private readonly fullstory: FullStoryService) {
    super()
  }

  findUser(where: Prisma.UserWhereUniqueInput) {
    return this.findUnique({
      where,
    })
  }

  findUserByEmail(email: string) {
    return this.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    })
  }

  async findByCampaign(campaign: Campaign) {
    return this.findUser({ id: campaign.userId })
  }

  async findByCustomerId(customerId: string) {
    return this.findFirst({
      where: {
        metaData: {
          path: ['customerId'],
          equals: customerId,
        },
      },
    })
  }

  findUserByResetToken(email: string, token: string) {
    return this.findFirstOrThrow({
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
    return this.model.update({
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
    return this.model.update({
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

    const hashedPassword = password ? await hashPassword(password) : null
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

    return this.model.create({
      data: {
        ...userData,
        ...trimmed,
        ...(hashedPassword ? { password: hashedPassword } : {}),
        hasPassword: !!hashedPassword,
        name: name?.trim() || `${firstNameTrimmed} ${lastNameTrimmed}`,
      },
    })
  }

  async updateUser(
    where: Prisma.UserWhereUniqueInput,
    data: Prisma.UserUpdateInput,
  ) {
    return this.model.update({
      where,
      data,
    })
  }

  async patchUserMetaData(
    userId: number,
    newMetaData: PrismaJson.UserMetaData,
  ) {
    const currentUser = await this.findUser({ id: userId })
    const currentMetaData = currentUser?.metaData
    return this.updateUser(
      {
        id: userId,
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
    return this.model.delete({
      where: {
        id,
      },
    })
  }

  trackUserById(userId: number) {
    return this.fullstory.trackUserById(userId)
  }
}
