import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common'
import { Campaign, Prisma, User } from '@prisma/client'
import {
  CreateUserInputDto,
  SIGN_UP_MODE,
} from '../schemas/CreateUserInput.schema'
import { hashPassword } from '../util/passwords.util'
import { trimMany } from '../../shared/util/strings.util'
import { WithOptional } from 'src/shared/types/utility.types'
import { AnalyticsService } from '../../analytics/analytics.service'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { CrmUsersService } from './crmUsers.service'

const REGISTER_USER_CRM_FORM_ID = '37d98f01-7062-405f-b0d1-c95179057db1'

@Injectable()
export class UsersService extends createPrismaBase(MODELS.User) {
  constructor(
    @Inject(forwardRef(() => AnalyticsService))
    private readonly analytics: AnalyticsService,
    @Inject(forwardRef(() => CrmUsersService))
    private readonly crm: CrmUsersService,
  ) {
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
    const { signUpMode, ...restUserData } = userData
    const {
      password,
      firstName,
      lastName,
      zip,
      phone,
      name,
      email: unNormalizedEmail,
    } = restUserData
    const email = unNormalizedEmail

    const hashedPassword = password ? await hashPassword(password) : null
    const existingUser = await this.findUser({ email })
    if (existingUser) {
      throw new ConflictException('User with this email already exists')
    }

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

    const userDataToPersist = {
      ...restUserData,
      ...trimmed,
      ...(hashedPassword ? { password: hashedPassword } : {}),
      hasPassword: !!hashedPassword,
      name: name?.trim() || `${firstNameTrimmed} ${lastNameTrimmed}`,
    }

    const user = await this.model.create({
      data: userDataToPersist,
    })

    // We have to await this form post to ensure the user is created in CRM
    //  before we try to update the crm contact with the user id
    await this.crm.submitCrmForm(
      REGISTER_USER_CRM_FORM_ID,
      [
        { name: 'firstName', value: firstName, objectTypeId: '0-1' },
        { name: 'lastName', value: lastName, objectTypeId: '0-1' },
        { name: 'email', value: email, objectTypeId: '0-1' },
        ...(phone
          ? [{ name: 'phone', value: phone, objectTypeId: '0-1' }]
          : []),
        ...(signUpMode
          ? [
              {
                name: 'facilitated_signup',
                value:
                  signUpMode === SIGN_UP_MODE.FACILITATED ? 'true' : 'false',
              },
            ]
          : []),
      ],
      'registerPage',
      'https://goodparty.org/sign-up',
    )

    await this.crm.trackUserUpdate(user.id)

    return user
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
    if (!currentUser) {
      this.logger.warn(
        `User with id ${userId} not found. Skipping metadata update`,
      )
      return null
    }

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
    return this.analytics.trackUserById(userId)
  }
}
